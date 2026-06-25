package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.users
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.bson.types.ObjectId
import org.litote.kmongo.eq
import org.litote.kmongo.setValue
import org.mindrot.jbcrypt.BCrypt

fun Route.userRoutes() {

    authenticate("auth-jwt") {
        route("/api/users") {

            // GET /api/users — Admin only
            get {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin access required")
                    )
                    return@get
                }
                val all = users.find().toList().map { it.toPublic() }
                call.respond(ApiResponse(success = true, data = all))
            }

            // GET /api/users/me — current user profile
            get("/me") {
                val principal = call.principal<JWTPrincipal>()!!
                val id = ObjectId(principal.userId())
                val user = users.findOneById(id)
                if (user == null) {
                    call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "User not found")
                    )
                    return@get
                }
                call.respond(ApiResponse(success = true, data = user.toPublic()))
            }

            // POST /api/users — Admin only, create user
            post {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin access required")
                    )
                    return@post
                }
                val body = call.receive<CreateUserRequest>()

                if (body.username.isBlank() || body.password.isBlank() || body.name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Username, name and password are required")
                    )
                    return@post
                }

                val existing = users.findOne(User::username eq body.username)
                if (existing != null) {
                    call.respond(HttpStatusCode.Conflict,
                        ApiResponse<Unit>(success = false, message = "Username already exists")
                    )
                    return@post
                }

                val validRoles = listOf("Admin", "User", "Support Agent")
                if (body.role !in validRoles) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(
                            success = false,
                            message = "Invalid role. Use: ${validRoles.joinToString(", ")}"
                        )
                    )
                    return@post
                }

                val user = User(
                    username = body.username.trim().lowercase(),
                    name = body.name.trim(),
                    passwordHash = BCrypt.hashpw(body.password, BCrypt.gensalt()),
                    role = body.role
                )
                users.insertOne(user)
                call.respond(HttpStatusCode.Created,
                    ApiResponse(success = true, message = "User created", data = user.toPublic())
                )
            }

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

            // PUT /api/users/{id} — Admin only
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
                val user = users.findOneById(oid)
                    ?: run { call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "User not found")
                    ); return@put }

                body.name?.let     { users.updateOneById(oid, setValue(User::name,   it.trim())) }
                body.role?.let     { users.updateOneById(oid, setValue(User::role,   it)) }
                body.active?.let   { users.updateOneById(oid, setValue(User::active, it)) }
                body.password?.let { users.updateOneById(oid, setValue(User::passwordHash, BCrypt.hashpw(it, BCrypt.gensalt()))) }

                val updated = users.findOneById(oid)
                call.respond(ApiResponse(success = true, message = "User updated", data = updated?.toPublic()))
            }

            // DELETE /api/users/{id} — Admin only, cannot delete self
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
