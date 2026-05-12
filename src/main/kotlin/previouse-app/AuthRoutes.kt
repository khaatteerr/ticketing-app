package com.helpdesk.routes

import com.helpdesk.database.DatabaseFactory.users
import com.helpdesk.models.ApiResponse
import com.helpdesk.models.LoginRequest
import com.helpdesk.models.LoginResponse
import com.helpdesk.models.toPublic
import com.helpdesk.utils.JwtConfig
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.litote.kmongo.eq
import org.mindrot.jbcrypt.BCrypt

fun Route.authRoutes() {

    route("/api/auth") {

        // POST /api/auth/login
        post("/login") {
            val body = call.receive<LoginRequest>()

            if (body.username.isBlank() || body.password.isBlank()) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ApiResponse<Unit>(success = false, message = "Username and password are required")
                )
                return@post
            }

            val user = users.findOne(com.helpdesk.models.User::username eq body.username)

            if (user == null || !user.active) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiResponse<Unit>(success = false, message = "Invalid username or password")
                )
                return@post
            }

            if (!BCrypt.checkpw(body.password, user.passwordHash)) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiResponse<Unit>(success = false, message = "Invalid username or password")
                )
                return@post
            }

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

        // POST /api/auth/verify  — check if token still valid
        post("/verify") {
            // Protected by JWT in routing — just return ok
            call.respond(ApiResponse<Unit>(success = true, message = "Token is valid"))
        }
    }
}
