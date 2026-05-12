package com.helpdesk.plugins

import com.helpdesk.models.ApiResponse
import com.helpdesk.routes.authRoutes
import com.helpdesk.routes.categoryRoutes
import com.helpdesk.routes.ticketRoutes
import com.helpdesk.routes.userRoutes
import io.ktor.server.application.*
import io.ktor.server.http.content.defaultResource
import io.ktor.server.http.content.resources
import io.ktor.server.http.content.static
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    routing {
        // Health check
        static("/") {
            resources("previouse-app")
            defaultResource("login.html") // Fallback to login.html if no specific file is requested
        }

        // Redirect the root path to the login page
        get("/") {
            call.respondRedirect("/login.html", permanent = false)
        }
        get("/health") {
            call.respond(ApiResponse<Unit>(success = true, message = "OK"))
        }

        // API routes
        authRoutes()
        userRoutes()
        ticketRoutes()
        categoryRoutes()
    }
}
