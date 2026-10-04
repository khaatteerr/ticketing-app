package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.users
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.bson.types.ObjectId
import com.mongodb.client.model.Filters
import org.litote.kmongo.setValue

fun Route.userRoutes() {

    authenticate("auth-jwt") {
        route("/api/users") {

            // GET /api/users — Admin and Support Agent
            get {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() !in listOf("Admin", "Support Agent")) {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin or Support Agent access required")
                    )
                    return@get
                }
                val params = call.request.queryParameters
                val extra = mutableListOf<org.bson.conversions.Bson>()
                when (params["status"]) {
                    "active" -> extra += Filters.ne("active", false)
                    "suspended" -> extra += Filters.eq("active", false)
                }
                if (params["recentSync"] == "true") {
                    val names = AdSyncState.lastNewUsers
                    extra += Filters.`in`("username", names)
                }
                val filter = queryFilter(params, listOf("name", "username", "department", "email"), mapOf("role" to "role", "department" to "department", "source" to "source"), extra)
                val page = PageQuery.parse(params, setOf("name", "username", "department", "role", "createdAt", "lastSyncedAt"))
                val result = users.pageResponse(page, filter) { it.toPublic() }
                call.respond(if (params["summary"] == "true") result.copy(summary = users.groupCounts("role")) else result)
            }

            // GET /api/users/me — current user profile
            get("/me") {
                val principal = call.principal<JWTPrincipal>()!!
                val id = runCatching { ObjectId(principal.userId()) }.getOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid token"))
                        return@get
                    }
                val user = users.findOneById(id)
                if (user == null) {
                    call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "User not found")
                    )
                    return@get
                }
                call.respond(ApiResponse(success = true, data = user.toPublic()))
            }

            // Users are created only by the AD sync (see UserSync.kt) — there is no
            // POST /api/users here anymore.

            // GET /api/users/{id}
            get("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin access required")
                    )
                    return@get
                }
                val id = call.parameters["id"] ?: return@get
                runCatching { ObjectId(id) }.getOrNull()?.let { oid ->
                    val user = users.findOneById(oid)
                    if (user == null) call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "User not found")
                    )
                    else call.respond(ApiResponse(success = true, data = user.toPublic()))
                } ?: call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ID"))
            }

            // PUT /api/users/{id} — Admin only. AD owns name/email/department/active;
            // the only thing an admin can change here is the app-level role.
            put("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin access required")
                    )
                    return@put
                }
                val id = call.parameters["id"] ?: return@put
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Invalid ID")
                    ); return@put }

                val body = call.receive<UpdateUserRequest>()
                val existing = users.findOneById(oid)
                    ?: run { call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "User not found")
                    ); return@put }

                val validRoles = listOf("Admin", "User", "Support Agent")
                body.role?.let { newRole ->
                    if (newRole !in validRoles) {
                        call.respond(HttpStatusCode.BadRequest,
                            ApiResponse<Unit>(success = false, message = "Invalid role. Use: ${validRoles.joinToString(", ")}")
                        )
                        return@put
                    }
                    // Don't let the last admin demote themselves by accident
                    if (existing.id.toHexString() == principal.userId() && newRole != "Admin") {
                        call.respond(HttpStatusCode.BadRequest,
                            ApiResponse<Unit>(success = false, message = "Cannot change your own admin role")
                        )
                        return@put
                    }
                    users.updateOneById(oid, setValue(User::role, newRole))
                }

                val updated = users.findOneById(oid)
                call.respond(ApiResponse(success = true, message = "User updated", data = updated?.toPublic()))
            }

            // DELETE /api/users/{id} — Admin only, cannot delete self.
            // NOTE: if this user is source == "AD", the next sync will simply re-create it as active.
            // To keep someone out permanently, disable their AD account instead of deleting here.
            delete("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin access required")
                    )
                    return@delete
                }
                val id = call.parameters["id"] ?: return@delete
                if (id == principal.userId()) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Cannot delete your own account")
                    )
                    return@delete
                }
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Invalid ID")
                    ); return@delete }

                val result = users.deleteOneById(oid)
                if (result.deletedCount == 0L)
                    call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "User not found")
                    )
                else
                    call.respond(ApiResponse<Unit>(success = true, message = "User deleted"))
            }
        }
    }
}
