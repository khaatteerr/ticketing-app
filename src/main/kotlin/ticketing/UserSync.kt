package com.eraqi.ticketing

import com.mongodb.client.model.Filters
import com.mongodb.client.model.UpdateOptions
import com.mongodb.client.model.Updates
import org.litote.kmongo.coroutine.CoroutineDatabase
import org.slf4j.LoggerFactory
import java.util.regex.Pattern

private val log = LoggerFactory.getLogger("AdSync")

object AdSyncState {
    @Volatile var lastSyncAt: Long? = null
    @Volatile var lastSyncCount: Int = 0
    @Volatile var lastSyncStatus: String = "Idle"
    @Volatile var lastError: String? = null
    @Volatile var isSyncing: Boolean = false
    @Volatile var lastNewUsers: List<String> = emptyList()
}

data class SyncResult(
    val totalProcessed: Int,
    val deptsCount: Int,
    val syncedAt: Long,
    val newUsers: List<String> = emptyList()
)

/**
 * Copies users and departments from AD into MongoDB.
 *  - Only AD-owned fields are updated; "role" is set once at creation and never overwritten.
 *  - Existing local users are linked by username (case-insensitive) instead of being duplicated.
 *  - Users that disappear from AD are deactivated, never deleted (tickets still reference them).
 */
suspend fun syncUsers(ldap: LdapService, db: CoroutineDatabase): SyncResult {
    val users = db.getCollection<User>("users")
    val depts = db.getCollection<Department>("departments")
    val now = System.currentTimeMillis()
    val upsert = UpdateOptions().upsert(true)

    AdSyncState.isSyncing = true
    AdSyncState.lastSyncStatus = "Syncing"

    try {
        val adUsers = ldap.fetchUsers()

        // Safety: if AD returned nothing (bad config, DC down) do NOT deactivate everybody.
        if (adUsers.isEmpty()) {
            log.warn("AD sync skipped: no users returned")
            AdSyncState.lastSyncStatus = "Warning: 0 users returned from AD"
            return SyncResult(0, 0, now)
        }

        val newlyAddedUsernames = mutableListOf<String>()

        adUsers.forEach { u ->
            val username = u.username.lowercase()
            val usernameMatch = Filters.regex("username", "^" + Pattern.quote(username) + "$", "i")

            val updateResult = users.updateOne(
                Filters.or(Filters.eq("adGuid", u.guid), usernameMatch),
                Updates.combine(
                    Updates.set("username", username),
                    Updates.set("name", u.displayName ?: username),
                    Updates.set("email", u.email),
                    Updates.set("department", u.department),
                    Updates.set("title", u.title),
                    Updates.set("adGuid", u.guid),
                    Updates.set("dn", u.dn),
                    Updates.set("source", "AD"),
                    Updates.set("active", u.enabled),
                    Updates.set("lastSyncedAt", now),
                    Updates.setOnInsert("role", "User"),
                    Updates.setOnInsert("createdAt", now)
                ),
                upsert
            )

            if (updateResult.upsertedId != null) {
                newlyAddedUsernames.add(username)
            }
        }

        // Departments (from OUs)
        val distinctDepts = adUsers.mapNotNull { it.department?.trim() }
            .filter { it.isNotEmpty() }
            .distinct()

        distinctDepts.forEach { name ->
            depts.updateOne(
                Filters.eq("name", name),
                Updates.setOnInsert("createdAt", now),
                upsert
            )
        }

        // AD users that no longer exist in AD -> deactivate
        users.updateMany(
            Filters.and(Filters.eq("source", "AD"), Filters.lt("lastSyncedAt", now)),
            Updates.set("active", false)
        )

        // Recalculate department ticket & user counts
        recalculateDepartmentStats(db)

        AdSyncState.lastSyncAt = now
        AdSyncState.lastSyncCount = adUsers.size
        AdSyncState.lastSyncStatus = "Success"
        AdSyncState.lastError = null
        AdSyncState.lastNewUsers = newlyAddedUsernames

        log.info("AD sync finished: {} users processed, {} departments synced, {} newly added", adUsers.size, distinctDepts.size, newlyAddedUsernames.size)
        return SyncResult(adUsers.size, distinctDepts.size, now, newlyAddedUsernames)

    } catch (e: Exception) {
        AdSyncState.lastSyncStatus = "Failed"
        AdSyncState.lastError = e.message ?: "Unknown error"
        throw e
    } finally {
        AdSyncState.isSyncing = false
    }
}

/**
 * Recalculates ticketCount, activeTicketCount, and memberCount for each department in MongoDB.
 */
suspend fun recalculateDepartmentStats(db: CoroutineDatabase) {
    val depts = db.getCollection<Department>("departments")
    val tickets = db.getCollection<Ticket>("tickets")
    val users = db.getCollection<User>("users")

    val allDepts = depts.find().toList()
    for (d in allDepts) {
        val deptPattern = "^" + Pattern.quote(d.name) + "$"
        val totalTickets = tickets.countDocuments(Filters.regex("submittedByDepartment", deptPattern, "i")).toInt()
        val activeTickets = tickets.countDocuments(
            Filters.and(
                Filters.regex("submittedByDepartment", deptPattern, "i"),
                Filters.`in`("status", "Open", "In Progress", "Pending")
            )
        ).toInt()
        val members = users.countDocuments(
            Filters.and(
                Filters.regex("department", deptPattern, "i"),
                Filters.eq("active", true)
            )
        ).toInt()

        depts.updateOne(
            Filters.eq("_id", d.id),
            Updates.combine(
                Updates.set("ticketCount", totalTickets),
                Updates.set("activeTicketCount", activeTickets),
                Updates.set("memberCount", members)
            )
        )
    }
}
