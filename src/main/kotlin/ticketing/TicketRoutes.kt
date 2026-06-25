package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.tickets
import com.eraqi.ticketing.DatabaseFactory.users
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.bson.types.ObjectId
import org.litote.kmongo.*
import java.time.Year

fun Route.ticketRoutes() {

    authenticate("auth-jwt") {
        route("/api/tickets") {

            // GET /api/tickets — Admin/Support see all; User sees own
            get {
                val principal = call.principal<JWTPrincipal>()!!
                val role      = principal.role()
                val uname     = principal.username()

                val statusFilter   = call.request.queryParameters["status"]
                val priorityFilter = call.request.queryParameters["priority"]
                val categoryFilter = call.request.queryParameters["category"]
                val assignedFilter = call.request.queryParameters["assignedTo"]
                val search         = call.request.queryParameters["search"]

                val all = when (role) {
                    "Admin", "Support Agent" -> tickets.find().toList()
                    else -> tickets.find(Ticket::submittedBy eq uname).toList()
                }

                val filtered = all.filter { t ->
                    (statusFilter   == null || t.status   == statusFilter) &&
                    (priorityFilter == null || t.priority == priorityFilter) &&
                    (categoryFilter == null || t.category == categoryFilter) &&
                    (assignedFilter == null || t.assignedTo == assignedFilter) &&
                    (search == null || t.title.contains(search, ignoreCase = true) ||
                        t.ticketId.contains(search, ignoreCase = true) ||
                        t.submittedBy.contains(search, ignoreCase = true))
                }.sortedByDescending { it.createdAt }

                call.respond(ApiResponse(success = true, data = filtered.map { it.toPublic() }))
            }

            // POST /api/tickets — any logged-in user creates a ticket (full form)
            post {
                val principal = call.principal<JWTPrincipal>()!!
                val body = call.receive<CreateTicketRequest>()

                if (body.title.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Title is required")
                    )
                    return@post
                }
                if (body.category.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Category is required")
                    )
                    return@post
                }

                val ticket = Ticket(
                    ticketId = generateTicketId(),
                    title = body.title.trim(),
                    description = body.description.trim(),
                    category = body.category,
                    priority = body.priority,
                    status = "Open",
                    submittedBy = principal.username(),
                    submittedByName = principal.name()
                )
                tickets.insertOne(ticket)
                call.respond(HttpStatusCode.Created,
                    ApiResponse(success = true, message = "Ticket created", data = ticket.toPublic())
                )
            }

            // POST /api/tickets/submit — Employee simple submit (title + message + status=Open)
            post("/submit") {
                val principal = call.principal<JWTPrincipal>()!!
                val body = call.receive<SubmitTicketRequest>()

                if (body.title.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Title is required")
                    )
                    return@post
                }
                if (body.message.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Message is required")
                    )
                    return@post
                }

                val ticket = Ticket(
                    ticketId = generateTicketId(),
                    title = body.title.trim(),
                    description = body.message.trim(),
                    category = "General IT Support",
                    priority = "Medium",
                    status = "Open",   // always Open from employee
                    submittedBy = principal.username(),
                    submittedByName = principal.name()
                )
                tickets.insertOne(ticket)
                call.respond(HttpStatusCode.Created,
                    ApiResponse(success = true, message = "Your ticket has been submitted!", data = ticket.toPublic())
                )
            }

            // GET /api/tickets/{id}
            get("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                val id  = call.parameters["id"] ?: return@get
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Invalid ID")
                    ); return@get }

                val ticket = tickets.findOneById(oid)
                    ?: run { call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "Ticket not found")
                    ); return@get }

                // Users can only see their own
                if (principal.role() == "User" && ticket.submittedBy != principal.username()) {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Access denied")
                    )
                    return@get
                }
                call.respond(ApiResponse(success = true, data = ticket.toPublic()))
            }

            // PUT /api/tickets/{id} — Admin/Support full update; User limited
            put("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                val id  = call.parameters["id"] ?: return@put
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Invalid ID")
                    ); return@put }

                val ticket = tickets.findOneById(oid)
                    ?: run { call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "Ticket not found")
                    ); return@put }

                if (principal.role() == "User" && ticket.submittedBy != principal.username()) {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Access denied")
                    )
                    return@put
                }

                val body = call.receive<UpdateTicketRequest>()
                val isAdminOrSupport = principal.role() in listOf("Admin", "Support Agent")

                body.title?.let       { tickets.updateOneById(oid, setValue(Ticket::title, it.trim())) }
                body.description?.let { tickets.updateOneById(oid, setValue(Ticket::description, it.trim())) }
                if (isAdminOrSupport) {
                    body.category?.let   { tickets.updateOneById(oid, setValue(Ticket::category,   it)) }
                    body.priority?.let   { tickets.updateOneById(oid, setValue(Ticket::priority,   it)) }
                    body.status?.let     { tickets.updateOneById(oid, setValue(Ticket::status,     it)) }
                    body.assignedTo?.let { tickets.updateOneById(oid, setValue(Ticket::assignedTo, it)) }
                }
                tickets.updateOneById(oid, setValue(Ticket::updatedAt, System.currentTimeMillis()))

                val updated = tickets.findOneById(oid)
                call.respond(ApiResponse(success = true, message = "Ticket updated", data = updated?.toPublic()))
            }

            // DELETE /api/tickets/{id} — Admin only
            delete("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Admin access required")
                    )
                    return@delete
                }
                val id  = call.parameters["id"] ?: return@delete
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest,
                        ApiResponse<Unit>(success = false, message = "Invalid ID")
                    ); return@delete }

                val result = tickets.deleteOneById(oid)
                if (result.deletedCount == 0L)
                    call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "Ticket not found")
                    )
                else
                    call.respond(ApiResponse<Unit>(success = true, message = "Ticket deleted"))
            }
        }

        // GET /api/stats — dashboard stats
        get("/api/stats") {
            val principal = call.principal<JWTPrincipal>()!!
            val all = if (principal.role() == "User")
                tickets.find(Ticket::submittedBy eq principal.username()).toList()
            else
                tickets.find().toList()

            val totalUsers = if (principal.role() == "Admin") users.countDocuments().toInt() else 0
            val totalCats  = DatabaseFactory.categories.countDocuments().toInt()

            call.respond(
                ApiResponse(
                    success = true, data = StatsResponse(
                        total = all.size,
                        open = all.count { it.status == "Open" },
                        inProgress = all.count { it.status == "In Progress" },
                        pending = all.count { it.status == "Pending" },
                        resolved = all.count { it.status == "Resolved" },
                        closed = all.count { it.status == "Closed" },
                        totalUsers = totalUsers,
                        totalCategories = totalCats
                    )
                )
            )
        }
    }
}

private suspend fun generateTicketId(): String {
    val year  = Year.now().value
    val count = (tickets.countDocuments() + 1)
    return "TKT-$year-${count.toString().padStart(3, '0')}"
}
