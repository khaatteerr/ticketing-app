package com.eraqi.ticketing

import com.eraqi.ticketing.DatabaseFactory.issueHeads
import com.eraqi.ticketing.DatabaseFactory.subIssues
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.bson.types.ObjectId
import org.litote.kmongo.eq
import org.litote.kmongo.setValue

fun Route.issueRoutes() {

    authenticate("auth-jwt") {

        // ── ISSUE HEADS ──────────────────────────────────────────────────────
        route("/api/issue-heads") {

            // GET /api/issue-heads — all authenticated users
            get {
                val all = issueHeads.find().toList().map { it.toPublic() }
                call.respond(ApiResponse(success = true, data = all))
            }

            // POST /api/issue-heads — Admin only
            post {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@post
                }

                val body = call.receive<CreateIssueHeadRequest>()
                if (body.name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Name is required"))
                    return@post
                }

                val head = IssueHead(name = body.name.trim(), icon = body.icon, description = body.description.trim())
                issueHeads.insertOne(head)
                call.respond(HttpStatusCode.Created, ApiResponse(success = true, message = "Issue head created", data = head.toPublic()))
            }

            // DELETE /api/issue-heads/{id} — Admin only (cascades sub-issues)
            delete("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@delete
                }

                val id = call.parameters["id"] ?: return@delete
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ID"))
                        return@delete
                    }

                val result = issueHeads.deleteOneById(oid)
                if (result.deletedCount == 0L) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse<Unit>(success = false, message = "Issue head not found"))
                } else {
                    // Cascade-delete all sub-issues belonging to this head
                    subIssues.deleteMany(SubIssue::headId eq id)
                    call.respond(ApiResponse<Unit>(success = true, message = "Issue head and its sub-issues deleted"))
                }
            }
        }

        // ── SUB-ISSUES ───────────────────────────────────────────────────────
        route("/api/sub-issues") {

            // GET /api/sub-issues?department=<name> — all authenticated users
            // If department query param is provided, filter to that dept only
            get {
                val deptFilter = call.request.queryParameters["department"]
                val all = if (!deptFilter.isNullOrBlank()) {
                    subIssues.find(SubIssue::department eq deptFilter).toList()
                } else {
                    subIssues.find().toList()
                }
                call.respond(ApiResponse(success = true, data = all.map { it.toPublic() }))
            }

            // POST /api/sub-issues — Admin only
            post {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@post
                }

                val body = call.receive<CreateSubIssueRequest>()
                if (body.name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Name is required"))
                    return@post
                }
                if (body.department.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Department is required"))
                    return@post
                }

                // Resolve the head name
                val headOid = runCatching { ObjectId(body.headId) }.getOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid head ID"))
                        return@post
                    }

                val head = issueHeads.findOneById(headOid)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, ApiResponse<Unit>(success = false, message = "Issue head not found"))
                        return@post
                    }

                val priorityVal = if (body.priority.isNotBlank()) body.priority.trim() else "Medium"
                val sub = SubIssue(
                    headId = body.headId,
                    headName = head.name,
                    department = body.department.trim(),
                    name = body.name.trim(),
                    priority = priorityVal,
                    description = body.description.trim()
                )
                subIssues.insertOne(sub)
                call.respond(HttpStatusCode.Created, ApiResponse(success = true, message = "Sub-issue created", data = sub.toPublic()))
            }

            // PUT /api/sub-issues/{id} — Admin only
            put("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@put
                }

                val id = call.parameters["id"] ?: return@put
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ID"))
                        return@put
                    }

                val existing = subIssues.findOneById(oid)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, ApiResponse<Unit>(success = false, message = "Sub-issue not found"))
                        return@put
                    }

                val body = call.receive<UpdateSubIssueRequest>()
                body.name?.let { if (it.isNotBlank()) subIssues.updateOneById(oid, setValue(SubIssue::name, it.trim())) }
                body.department?.let { if (it.isNotBlank()) subIssues.updateOneById(oid, setValue(SubIssue::department, it.trim())) }
                body.priority?.let { if (it.isNotBlank()) subIssues.updateOneById(oid, setValue(SubIssue::priority, it.trim())) }
                body.description?.let { subIssues.updateOneById(oid, setValue(SubIssue::description, it.trim())) }

                val updated = subIssues.findOneById(oid)
                call.respond(ApiResponse(success = true, message = "Sub-issue updated", data = updated?.toPublic()))
            }

            // DELETE /api/sub-issues/{id} — Admin only
            delete("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@delete
                }

                val id = call.parameters["id"] ?: return@delete
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ID"))
                        return@delete
                    }

                val result = subIssues.deleteOneById(oid)
                if (result.deletedCount == 0L)
                    call.respond(HttpStatusCode.NotFound, ApiResponse<Unit>(success = false, message = "Sub-issue not found"))
                else
                    call.respond(ApiResponse<Unit>(success = true, message = "Sub-issue deleted"))
            }
        }

        // ── TREE VIEW ─────────────────────────────────────────────────────────
        // GET /api/issues/tree — returns all heads with their nested sub-issues
        get("/api/issues/tree") {
            val heads = issueHeads.find().toList().map { it.toPublic() }
            val allSubs = subIssues.find().toList().map { it.toPublic() }

            val tree = heads.map { head ->
                IssueTreeNode(
                    head = head,
                    subIssues = allSubs.filter { it.headId == head.id }
                )
            }
            call.respond(ApiResponse(success = true, data = tree))
        }
    }
}
