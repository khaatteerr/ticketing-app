package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.subIssues
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
import com.mongodb.client.model.Filters
import com.mongodb.client.model.Updates
import java.time.Year
import java.util.regex.Pattern

fun Route.ticketRoutes() {

    authenticate("auth-jwt") {
        route("/api/tickets") {

            // GET /api/tickets — Admin/Support see all; User sees own/assigned; scope=assigned|submitted
            get {
                val principal = call.principal<JWTPrincipal>()!!
                val params = call.request.queryParameters
                call.respond(ticketPage(params, ticketAccessFilter(principal, params["scope"])))
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

                val dept = body.department?.takeIf { it.isNotBlank() }
                    ?: principal.department()?.takeIf { it.isNotBlank() }
                    ?: users.findOne(User::username eq principal.username())?.department

                val ip = DeviceUtils.getClientIp(call)
                val ua = call.request.headers["User-Agent"]
                val device = DeviceUtils.parseDevice(ua)

                // Sub-issue priority overrides or falls back to body.priority
                val subIssue = body.issue?.takeIf { it.isNotBlank() }?.let { issueName ->
                    subIssues.findOne(SubIssue::name eq issueName)
                }
                val priorityVal = subIssue?.priority
                    ?: body.priority.takeIf { it.isNotBlank() }
                    ?: "Medium"

                val assignedToVal = body.assignedTo?.takeIf { it.isNotBlank() } ?: "Unassigned"
                if (assignedToVal != "Unassigned" && principal.role() !in listOf("Admin", "Support Agent")) {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Only admins or support agents can assign tickets"))
                    return@post
                }
                val assignee = if (assignedToVal != "Unassigned") users.findOne(User::username eq assignedToVal) else null
                if (assignedToVal != "Unassigned" && (assignee == null || !assignee.active)) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Select an active user from the user list"))
                    return@post
                }
                val assignedToNameVal = assignee?.name

                val ticket = Ticket(
                    ticketId = generateTicketId(),
                    title = body.title.trim(),
                    description = body.description.trim(),
                    category = body.category,
                    priority = priorityVal,
                    status = "Open",
                    submittedBy = principal.username(),
                    submittedByName = principal.name(),
                    submittedByDepartment = dept,
                    assignedTo = assignedToVal,
                    assignedToName = assignedToNameVal,
                    issue = body.issue,
                    issueHead = body.issueHead,
                    ip = ip,
                    device = device,
                    userAgent = ua
                )
                tickets.insertOne(ticket)

                if (!dept.isNullOrBlank()) {
                    DatabaseFactory.departments.updateOne(
                        Filters.regex("name", "^" + Pattern.quote(dept) + "$", "i"),
                        Updates.combine(
                            Updates.inc("ticketCount", 1),
                            Updates.inc("activeTicketCount", 1)
                        )
                    )
                }

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

                // If sub-issue selected, its admin-configured priority takes precedence
                val subIssue = body.issue?.takeIf { it.isNotBlank() }?.let { issueName ->
                    subIssues.findOne(SubIssue::name eq issueName)
                }
                val priorityVal = subIssue?.priority
                    ?: body.priority?.takeIf { it.isNotBlank() }
                    ?: "Medium"

                val dept = body.department?.takeIf { it.isNotBlank() }
                    ?: principal.department()?.takeIf { it.isNotBlank() }
                    ?: users.findOne(User::username eq principal.username())?.department

                val ip = DeviceUtils.getClientIp(call)
                val ua = call.request.headers["User-Agent"]
                val device = DeviceUtils.parseDevice(ua)

                val ticket = Ticket(
                    ticketId = generateTicketId(),
                    title = body.title.trim(),
                    description = body.message.trim(),
                    category = "General IT Support",
                    priority = priorityVal,
                    status = "Open",   // always Open from employee
                    submittedBy = principal.username(),
                    submittedByName = principal.name(),
                    submittedByDepartment = dept,
                    issue = body.issue,
                    issueHead = body.issueHead,
                    ip = ip,
                    device = device,
                    userAgent = ua
                )
                tickets.insertOne(ticket)

                if (!dept.isNullOrBlank()) {
                    DatabaseFactory.departments.updateOne(
                        Filters.regex("name", "^" + Pattern.quote(dept) + "$", "i"),
                        Updates.combine(
                            Updates.inc("ticketCount", 1),
                            Updates.inc("activeTicketCount", 1)
                        )
                    )
                }

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

                // Users can see their own tickets or tickets assigned to them
                val isOwnerOrAssignee = ticket.submittedBy == principal.username() ||
                                        ticket.assignedTo == principal.username()
                if (principal.role() == "User" && !isOwnerOrAssignee) {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Access denied")
                    )
                    return@get
                }

                val configured = ticket.issue?.let { subIssues.find(SubIssue::name eq it).sort(org.bson.Document("_id", 1)).limit(1).first() }
                call.respond(ApiResponse(success = true, data = ticket.copy(priority = configured?.priority ?: ticket.priority).toPublic()))
            }

            // PUT /api/tickets/{id} — Admin/Support full update; Assignee can update status
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

                val isOwnerOrAssignee = ticket.submittedBy == principal.username() ||
                                        ticket.assignedTo == principal.username()
                if (principal.role() == "User" && !isOwnerOrAssignee) {
                    call.respond(HttpStatusCode.Forbidden,
                        ApiResponse<Unit>(success = false, message = "Access denied")
                    )
                    return@put
                }

                val body = call.receive<UpdateTicketRequest>()
                val isAdminOrSupport = principal.role() in listOf("Admin", "Support Agent")
                val isAssignee = ticket.assignedTo == principal.username()

                if (!isAdminOrSupport && (body.assignedTo != null || body.assignedToName != null)) {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Only admins or support agents can assign tickets"))
                    return@put
                }
                if (body.status != null && (!isAdminOrSupport && !isAssignee)) {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Only the assigned user or support team can update status"))
                    return@put
                }
                if (body.status != null && body.status !in listOf("Open", "In Progress", "Pending", "Resolved", "Closed")) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ticket status"))
                    return@put
                }
                val newAssignee = body.assignedTo
                val assignee = if (newAssignee != null && newAssignee != "Unassigned") users.findOne(User::username eq newAssignee) else null
                if (newAssignee != null && newAssignee != "Unassigned" && (assignee == null || !assignee.active)) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Select an active user from the user list"))
                    return@put
                }

                val oldStatus = ticket.status
                val newStatus = body.status
                if ((isAdminOrSupport || isAssignee) && newStatus != null && newStatus != oldStatus && !ticket.submittedByDepartment.isNullOrBlank()) {
                    val wasActive = oldStatus in listOf("Open", "In Progress", "Pending")
                    val isNowActive = newStatus in listOf("Open", "In Progress", "Pending")
                    if (wasActive && !isNowActive) {
                        DatabaseFactory.departments.updateOne(
                            Filters.regex("name", "^" + Pattern.quote(ticket.submittedByDepartment) + "$", "i"),
                            Updates.inc("activeTicketCount", -1)
                        )
                    } else if (!wasActive && isNowActive) {
                        DatabaseFactory.departments.updateOne(
                            Filters.regex("name", "^" + Pattern.quote(ticket.submittedByDepartment) + "$", "i"),
                            Updates.inc("activeTicketCount", 1)
                        )
                    }
                }

                if (isAdminOrSupport || ticket.submittedBy == principal.username()) {
                    body.title?.let       { tickets.updateOneById(oid, setValue(Ticket::title, it.trim())) }
                    body.description?.let { tickets.updateOneById(oid, setValue(Ticket::description, it.trim())) }
                }

                // Assignee or Admin/Support can update status
                if (isAdminOrSupport || isAssignee) {
                    body.status?.let { tickets.updateOneById(oid, setValue(Ticket::status, it)) }
                }

                if (isAdminOrSupport) {
                    body.category?.let   { tickets.updateOneById(oid, setValue(Ticket::category,   it)) }
                    body.priority?.let   { tickets.updateOneById(oid, setValue(Ticket::priority,   it)) }
                    body.issue?.let      { tickets.updateOneById(oid, setValue(Ticket::issue,      it)) }
                    body.issueHead?.let  { tickets.updateOneById(oid, setValue(Ticket::issueHead,  it)) }
                    if (newAssignee != null) {
                        tickets.updateOneById(oid, combine(
                            setValue(Ticket::assignedTo, newAssignee),
                            setValue(Ticket::assignedToName, assignee?.name)
                        ))
                    }
                }
                tickets.updateOneById(oid, setValue(Ticket::updatedAt, System.currentTimeMillis()))

                val updated = tickets.findOneById(oid)
                call.respond(ApiResponse(success = true, message = "Ticket updated", data = updated?.toPublic()))
            }

            // Replies are authored by the current assignee; identity comes from the JWT.
            post("/{id}/replies") {
                val principal = call.principal<JWTPrincipal>()!!
                val oid = runCatching { ObjectId(call.parameters["id"]) }.getOrNull()
                if (oid == null) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ticket ID"))
                    return@post
                }
                val ticket = tickets.findOneById(oid)
                if (ticket == null) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse<Unit>(success = false, message = "Ticket not found"))
                    return@post
                }
                if (ticket.assignedTo != principal.username()) {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Only the assigned user can reply to this ticket"))
                    return@post
                }
                val message = call.receive<CreateTicketReplyRequest>().message.trim()
                if (message.isEmpty() || message.length > 2000) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Reply must contain 1 to 2000 characters"))
                    return@post
                }
                val reply = TicketReply(authorUsername = principal.username(), authorName = principal.name(), message = message)
                // Atomic append avoids losing concurrent replies and checks assignment again.
                val result = tickets.updateOne(
                    and(Ticket::id eq oid, Ticket::assignedTo eq principal.username()),
                    combine(push(Ticket::replies, reply), setValue(Ticket::updatedAt, reply.createdAt))
                )
                if (result.matchedCount == 0L) {
                    call.respond(HttpStatusCode.Conflict, ApiResponse<Unit>(success = false, message = "Ticket assignment changed. Refresh the ticket before replying."))
                    return@post
                }
                call.respond(HttpStatusCode.Created, ApiResponse(success = true, message = "Reply posted", data = reply))
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

                val ticket = tickets.findOneById(oid)
                val result = tickets.deleteOneById(oid)
                if (result.deletedCount == 0L || ticket == null)
                    call.respond(HttpStatusCode.NotFound,
                        ApiResponse<Unit>(success = false, message = "Ticket not found")
                    )
                else {
                    if (!ticket.submittedByDepartment.isNullOrBlank()) {
                        val wasActive = ticket.status in listOf("Open", "In Progress", "Pending")
                        val updates = if (wasActive) {
                            Updates.combine(
                                Updates.inc("ticketCount", -1),
                                Updates.inc("activeTicketCount", -1)
                            )
                        } else {
                            Updates.inc("ticketCount", -1)
                        }
                        DatabaseFactory.departments.updateOne(
                            Filters.regex("name", "^" + Pattern.quote(ticket.submittedByDepartment) + "$", "i"),
                            updates
                        )
                    }
                    call.respond(ApiResponse<Unit>(success = true, message = "Ticket deleted"))
                }
            }
        }

        // GET /api/stats — dashboard stats
        get("/api/stats") {
            val principal = call.principal<JWTPrincipal>()!!
            val counts = tickets.groupCounts("status", ticketAccessFilter(principal, null))

            val totalUsers = if (principal.role() == "Admin") users.countDocuments().toInt() else 0
            val totalCats  = DatabaseFactory.categories.countDocuments().toInt()
            val totalDepts = DatabaseFactory.departments.countDocuments().toInt()

            call.respond(
                ApiResponse(
                    success = true, data = StatsResponse(
                        total = counts.values.sum().toInt(),
                        open = (counts["Open"] ?: 0).toInt(),
                        inProgress = (counts["In Progress"] ?: 0).toInt(),
                        pending = (counts["Pending"] ?: 0).toInt(),
                        resolved = (counts["Resolved"] ?: 0).toInt(),
                        closed = (counts["Closed"] ?: 0).toInt(),
                        totalUsers = totalUsers,
                        totalCategories = totalCats,
                        totalDepartments = totalDepts
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

internal fun ticketAccessFilter(principal: JWTPrincipal, scope: String?): org.bson.conversions.Bson = when {
    scope == "assigned" -> Filters.eq("assignedTo", principal.username())
    scope == "submitted" -> Filters.eq("submittedBy", principal.username())
    principal.role() in listOf("Admin", "Support Agent") -> org.bson.Document()
    else -> Filters.or(Filters.eq("submittedBy", principal.username()), Filters.eq("assignedTo", principal.username()))
}
