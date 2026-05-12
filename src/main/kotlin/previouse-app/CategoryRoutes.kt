package com.helpdesk.routes

import com.helpdesk.database.DatabaseFactory.categories
import com.helpdesk.models.*
import com.helpdesk.utils.role
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.bson.types.ObjectId
import org.litote.kmongo.eq
import org.litote.kmongo.setValue

fun Route.categoryRoutes() {

    authenticate("auth-jwt") {
        route("/api/categories") {

            // GET /api/categories — all users
            get {
                val all = categories.find().toList().map { it.toPublic() }
                call.respond(ApiResponse(success = true, data = all))
            }

            // POST /api/categories — Admin only
            post {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@post
                }
                val body = call.receive<CreateCategoryRequest>()
                if (body.name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Category name is required"))
                    return@post
                }
                val existing = categories.findOne(Category::name eq body.name)
                if (existing != null) {
                    call.respond(HttpStatusCode.Conflict, ApiResponse<Unit>(success = false, message = "Category already exists"))
                    return@post
                }
                val cat = Category(name = body.name.trim(), icon = body.icon)
                categories.insertOne(cat)
                call.respond(HttpStatusCode.Created, ApiResponse(success = true, message = "Category created", data = cat.toPublic()))
            }

            // PUT /api/categories/{id} — Admin only
            put("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@put
                }
                val id  = call.parameters["id"] ?: return@put
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ID")); return@put }

                val body = call.receive<CreateCategoryRequest>()
                categories.updateOneById(oid, setValue(Category::name, body.name.trim()))
                categories.updateOneById(oid, setValue(Category::icon, body.icon))

                val updated = categories.findOneById(oid)
                call.respond(ApiResponse(success = true, message = "Category updated", data = updated?.toPublic()))
            }

            // DELETE /api/categories/{id} — Admin only
            delete("/{id}") {
                val principal = call.principal<JWTPrincipal>()!!
                if (principal.role() != "Admin") {
                    call.respond(HttpStatusCode.Forbidden, ApiResponse<Unit>(success = false, message = "Admin access required"))
                    return@delete
                }
                val id  = call.parameters["id"] ?: return@delete
                val oid = runCatching { ObjectId(id) }.getOrNull()
                    ?: run { call.respond(HttpStatusCode.BadRequest, ApiResponse<Unit>(success = false, message = "Invalid ID")); return@delete }

                val result = categories.deleteOneById(oid)
                if (result.deletedCount == 0L)
                    call.respond(HttpStatusCode.NotFound, ApiResponse<Unit>(success = false, message = "Category not found"))
                else
                    call.respond(ApiResponse<Unit>(success = true, message = "Category deleted"))
            }
        }
    }
}
