package com.eraqi.ticketing

import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.litote.kmongo.and
import org.litote.kmongo.eq

fun Route.adRoutes() {

    authenticate("auth-jwt") {

        route("/api/ad") {

            // GET /api/ad/status — Admin only
            get("/status") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@get
                }

                if (!DatabaseFactory.isLdapInitialized()) {
                    call.respond(
                        ApiResponse(
                            success = false,
                            message = "LDAP is not configured or initialized",
                            data = null
                        )
                    )
                    return@get
                }

                val ldap = DatabaseFactory.ldap
                val cfg = ldap.cfg

                val totalAdUsers = DatabaseFactory.users.countDocuments(User::source eq "AD").toInt()
                val activeAdUsers = DatabaseFactory.users.countDocuments(and(User::source eq "AD", User::active eq true)).toInt()
                val totalDepartments = DatabaseFactory.departments.countDocuments().toInt()

                // Fall back to latest lastSyncedAt from user document if AdSyncState.lastSyncAt is not yet populated
                val effectiveLastSyncAt = AdSyncState.lastSyncAt ?: run {
                    val latestUser = DatabaseFactory.users.find(User::source eq "AD")
                        .descendingSort(User::lastSyncedAt)
                        .first()
                    latestUser?.lastSyncedAt
                }

                val status = AdStatusResponse(
                    host = cfg.host,
                    port = cfg.port,
                    useSsl = cfg.useSsl,
                    baseDn = cfg.baseDn,
                    syncMinutes = cfg.syncMinutes,
                    lastSyncAt = effectiveLastSyncAt,
                    lastSyncCount = if (AdSyncState.lastSyncCount > 0) AdSyncState.lastSyncCount else totalAdUsers,
                    lastSyncStatus = AdSyncState.lastSyncStatus,
                    lastError = AdSyncState.lastError,
                    isSyncing = AdSyncState.isSyncing,
                    totalAdUsers = totalAdUsers,
                    activeAdUsers = activeAdUsers,
                    totalDepartments = totalDepartments,
                    lastNewUsers = AdSyncState.lastNewUsers
                )

                call.respond(ApiResponse(success = true, data = status))
            }

            // POST /api/ad/sync — Admin only: Trigger manual sync immediately
            post("/sync") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@post
                }

                if (!DatabaseFactory.isLdapInitialized()) {
                    call.respond(HttpStatusCode.ServiceUnavailable, ApiResponse<Unit>(success = false, message = "LDAP service is not available"))
                    return@post
                }

                if (AdSyncState.isSyncing) {
                    call.respond(HttpStatusCode.Conflict, ApiResponse<Unit>(success = false, message = "A sync is already in progress"))
                    return@post
                }

                try {
                    val result = withContext(Dispatchers.IO) {
                        syncUsers(DatabaseFactory.ldap, DatabaseFactory.db)
                    }

                    val totalAdUsers = DatabaseFactory.users.countDocuments(User::source eq "AD").toInt()
                    val activeAdUsers = DatabaseFactory.users.countDocuments(and(User::source eq "AD", User::active eq true)).toInt()
                    val totalDepartments = DatabaseFactory.departments.countDocuments().toInt()
                    val cfg = DatabaseFactory.ldap.cfg

                    val status = AdStatusResponse(
                        host = cfg.host,
                        port = cfg.port,
                        useSsl = cfg.useSsl,
                        baseDn = cfg.baseDn,
                        syncMinutes = cfg.syncMinutes,
                        lastSyncAt = result.syncedAt,
                        lastSyncCount = result.totalProcessed,
                        lastSyncStatus = "Success",
                        lastError = null,
                        isSyncing = false,
                        totalAdUsers = totalAdUsers,
                        activeAdUsers = activeAdUsers,
                        totalDepartments = totalDepartments,
                        lastNewUsers = result.newUsers
                    )

                    call.respond(
                        ApiResponse(
                            success = true,
                            message = "Active Directory sync completed successfully! ${result.totalProcessed} users and ${result.deptsCount} departments processed.",
                            data = status
                        )
                    )
                } catch (e: Exception) {
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        ApiResponse<Unit>(
                            success = false,
                            message = "Active Directory sync failed: ${e.message}"
                        )
                    )
                }
            }
        }
    }
}
