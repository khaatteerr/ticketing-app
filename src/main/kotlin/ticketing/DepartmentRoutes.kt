package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.departments
import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.departmentRoutes() {
    authenticate("auth-jwt") {
        route("/api/departments") {
            // GET /api/departments — any logged-in user (used to populate filters/dropdowns)
            get {

                val params = call.request.queryParameters
                call.respond(departments.pageResponse(
                    PageQuery.parse(params, setOf("name", "ticketCount", "activeTicketCount", "memberCount")),
                    queryFilter(params, listOf("name"))) { it.toPublic() })
            }
        }
    }
}
