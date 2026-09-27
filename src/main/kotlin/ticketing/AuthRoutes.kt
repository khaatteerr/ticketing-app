package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.users
import io.ktor.http.*
import io.ktor.server.auth.authenticate
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.mongodb.client.model.Updates
import org.litote.kmongo.eq
import org.mindrot.jbcrypt.BCrypt

fun Route.authRoutes() {

    route("/api/auth") {

        // POST /api/auth/login
        //  - AD users (source == "AD"): password is verified with an LDAP bind. Nothing is stored.
        //  - LOCAL users (e.g. the seeded emergency admin): checked with BCrypt against passwordHash.
        post("/login") {
            val body = call.receive<LoginRequest>()
            val username = body.username.trim().lowercase()

            if (username.isBlank() || body.password.isBlank()) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ApiResponse<Unit>(success = false, message = "Username and password are required")
                )
                return@post
            }

            val user = users.findOne(User::username eq username)
            print(user)

            // Same message for "unknown user", "disabled" and "wrong password" so usernames can't be probed
            if (user == null || !user.active) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiResponse<Unit>(success = false, message = "Invalid username or password")
                )
                return@post
            }

            val dn = user.dn
            val ok = if (user.source == "AD" && dn != null) {
                // LDAP calls block, so run them off the event loop
                print("user done")

                withContext(Dispatchers.IO) { DatabaseFactory.ldap.authenticate(dn, body.password) }
            } else {
                user.passwordHash?.let { BCrypt.checkpw(body.password, it) } ?: false
            }

            if (!ok) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiResponse<Unit>(success = false, message = "Invalid username or password")
                )
                return@post
            }

            val ip = DeviceUtils.getClientIp(call)
            val ua = call.request.headers["User-Agent"]
            val device = DeviceUtils.parseDevice(ua)
            users.updateOneById(user.id, Updates.combine(
                Updates.set("lastIp", ip),
                Updates.set("lastDevice", device),
                Updates.set("lastUserAgent", ua)
            ))

            val token = JwtConfig.generateToken(user)
            call.respond(
                HttpStatusCode.OK,
                ApiResponse(
                    success = true,
                    message = "Login successful",
                    data = LoginResponse(token = token, user = user.toPublic())
                )
            )
        }

        // POST /api/auth/verify — check if token is still valid
        authenticate("auth-jwt") {
            post("/verify") {
                call.respond(ApiResponse<Unit>(success = true, message = "Token is valid"))
            }
        }
    }
}
