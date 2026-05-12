package com.helpdesk.models

import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

// ─── USER ───────────────────────────────────────────────────────────
@Serializable
data class User(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val username: String,
    val name: String,
    val passwordHash: String,
    val role: String = "User",          // Admin | Support Agent | User
    val createdAt: Long = System.currentTimeMillis(),
    val active: Boolean = true
)

@Serializable
data class UserPublic(
    val id: String,
    val username: String,
    val name: String,
    val role: String,
    val createdAt: Long,
    val active: Boolean
)

fun User.toPublic() = UserPublic(
    id = id.toHexString(),
    username = username,
    name = name,
    role = role,
    createdAt = createdAt,
    active = active
)

@Serializable
data class CreateUserRequest(
    val username: String,
    val name: String,
    val password: String,
    val role: String = "User"
)

@Serializable
data class UpdateUserRequest(
    val name: String? = null,
    val role: String? = null,
    val active: Boolean? = null,
    val password: String? = null
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String
)

@Serializable
data class LoginResponse(
    val token: String,
    val user: UserPublic
)

// ─── TICKET ─────────────────────────────────────────────────────────
@Serializable
data class Ticket(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val ticketId: String,               // TKT-2024-001
    val title: String,
    val description: String = "",
    val category: String,
    val priority: String = "Medium",    // Low | Medium | High | Urgent
    val status: String = "Open",        // Open | In Progress | Pending | Resolved | Closed
    val submittedBy: String,            // username
    val submittedByName: String,        // display name
    val assignedTo: String = "Unassigned",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Serializable
data class TicketPublic(
    val id: String,
    val ticketId: String,
    val title: String,
    val description: String,
    val category: String,
    val priority: String,
    val status: String,
    val submittedBy: String,
    val submittedByName: String,
    val assignedTo: String,
    val createdAt: Long,
    val updatedAt: Long
)

fun Ticket.toPublic() = TicketPublic(
    id = id.toHexString(),
    ticketId = ticketId,
    title = title,
    description = description,
    category = category,
    priority = priority,
    status = status,
    submittedBy = submittedBy,
    submittedByName = submittedByName,
    assignedTo = assignedTo,
    createdAt = createdAt,
    updatedAt = updatedAt
)

@Serializable
data class CreateTicketRequest(
    val title: String,
    val description: String = "",
    val category: String,
    val priority: String = "Medium"
)

// Employee submit ticket (minimal — status always Open)
@Serializable
data class SubmitTicketRequest(
    val title: String,
    val message: String,        // maps to description
    val status: String = "Open" // always Open from employee
)

@Serializable
data class UpdateTicketRequest(
    val title: String? = null,
    val description: String? = null,
    val category: String? = null,
    val priority: String? = null,
    val status: String? = null,
    val assignedTo: String? = null
)

// ─── CATEGORY ───────────────────────────────────────────────────────
@Serializable
data class Category(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val name: String,
    val icon: String = "📁",
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class CategoryPublic(
    val id: String,
    val name: String,
    val icon: String,
    val createdAt: Long
)

fun Category.toPublic() = CategoryPublic(
    id = id.toHexString(),
    name = name,
    icon = icon,
    createdAt = createdAt
)

@Serializable
data class CreateCategoryRequest(
    val name: String,
    val icon: String = "📁"
)

// ─── GENERIC RESPONSE ───────────────────────────────────────────────
@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val message: String = "",
    val data: T? = null
)

@Serializable
data class StatsResponse(
    val total: Int,
    val open: Int,
    val inProgress: Int,
    val pending: Int,
    val resolved: Int,
    val closed: Int,
    val totalUsers: Int,
    val totalCategories: Int
)
