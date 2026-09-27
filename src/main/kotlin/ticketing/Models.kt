package com.eraqi.ticketing

import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

// ─── USER ───────────────────────────────────────────────────────────
// Users are imported from Active Directory (read-only). Role is managed only in this app.
@Serializable
data class User(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val username: String,                 // sAMAccountName, lowercase
    val name: String,                     // AD displayName
    val email: String? = null,
    val department: String? = null,       // AD OU name (fallback: AD "department" attribute)
    val title: String? = null,
    val adGuid: String? = null,           // stable AD identity (objectGUID)
    val dn: String? = null,               // distinguishedName, used for the LDAP bind at login
    val source: String = "LOCAL",         // AD | LOCAL (documents without this field are old local users)
    val passwordHash: String? = null,     // only for LOCAL emergency accounts; null for AD users
    val role: String = "User",            // Admin | Support Agent | User
    val lastIp: String? = null,           // last login IP
    val lastDevice: String? = null,       // friendly device name (e.g. Windows 10/11 (Chrome))
    val lastUserAgent: String? = null,    // raw User-Agent header
    val createdAt: Long = System.currentTimeMillis(),
    val lastSyncedAt: Long? = null,
    val active: Boolean = true            // mirrors the AD "enabled" flag
)

@Serializable
data class UserPublic(
    val id: String,
    val username: String,
    val name: String,
    val email: String?,
    val department: String?,
    val role: String,
    val source: String,
    val lastIp: String? = null,
    val lastDevice: String? = null,
    val createdAt: Long,
    val lastSyncedAt: Long?,
    val active: Boolean
)

fun User.toPublic() = UserPublic(
    id = id.toHexString(),
    username = username,
    name = name,
    email = email,
    department = department,
    role = role,
    source = source,
    lastIp = lastIp,
    lastDevice = lastDevice,
    createdAt = createdAt,
    lastSyncedAt = lastSyncedAt,
    active = active
)

// CreateUserRequest was removed: users now come from AD, not created by admins.
// An admin can only change the app-level role.
@Serializable
data class UpdateUserRequest(
    val role: String? = null
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

// ─── DEPARTMENT (new, filled from AD OUs) ───────────────────────────
@Serializable
data class Department(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val name: String,
    val ticketCount: Int = 0,
    val activeTicketCount: Int = 0,
    val memberCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class DepartmentPublic(
    val id: String,
    val name: String,
    val ticketCount: Int = 0,
    val activeTicketCount: Int = 0,
    val memberCount: Int = 0
)

fun Department.toPublic() = DepartmentPublic(
    id = id.toHexString(),
    name = name,
    ticketCount = ticketCount,
    activeTicketCount = activeTicketCount,
    memberCount = memberCount
)

@Serializable
data class TicketReply(
    val id: String = ObjectId().toHexString(),
    val authorUsername: String,
    val authorName: String,
    val message: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class CreateTicketReplyRequest(val message: String)

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
    val issue: String? = null,          // Sub-issue name (e.g. "Headphone issue")
    val issueHead: String? = null,      // Head name (e.g. "Software" or "Hardware")
    val priority: String = "Medium",    // Low | Medium | High | Urgent
    val status: String = "Open",        // Open | In Progress | Pending | Resolved | Closed
    val submittedBy: String,            // username
    val submittedByName: String,        // display name
    val submittedByDepartment: String? = null,   // copied from the user when the ticket is created
    val assignedTo: String = "Unassigned",
    val assignedToName: String? = null,
    val ip: String? = null,                      // client IP when ticket created
    val device: String? = null,                  // client device when ticket created
    val userAgent: String? = null,               // raw User-Agent header
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val replies: List<TicketReply> = emptyList()
)

@Serializable
data class TicketPublic(
    val id: String,
    val ticketId: String,
    val title: String,
    val description: String,
    val category: String,
    val issue: String? = null,
    val issueHead: String? = null,
    val priority: String,
    val status: String,
    val submittedBy: String,
    val submittedByName: String,
    val submittedByDepartment: String?,
    val assignedTo: String,
    val assignedToName: String? = null,
    val ip: String? = null,
    val device: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val replies: List<TicketReply> = emptyList()
)

fun Ticket.toPublic() = TicketPublic(
    id = id.toHexString(),
    ticketId = ticketId,
    title = title,
    description = description,
    category = category,
    issue = issue,
    issueHead = issueHead,
    priority = priority,
    status = status,
    submittedBy = submittedBy,
    submittedByName = submittedByName,
    submittedByDepartment = submittedByDepartment,
    assignedTo = assignedTo,
    assignedToName = assignedToName,
    ip = ip,
    device = device,
    createdAt = createdAt,
    updatedAt = updatedAt,
    replies = replies
)

@Serializable
data class CreateTicketRequest(
    val title: String,
    val description: String = "",
    val category: String,
    val issue: String? = null,
    val issueHead: String? = null,
    val priority: String = "Medium",
    val department: String? = null,
    val assignedTo: String? = null,
    val assignedToName: String? = null
)

// Employee submit ticket (minimal — status always Open)
@Serializable
data class SubmitTicketRequest(
    val title: String,
    val message: String = "",        // maps to description, optional
    val issue: String? = null,
    val issueHead: String? = null,
    val priority: String? = null,    // optional; resolved from sub-issue configured by admin
    val status: String = "Open",      // always Open from employee
    val department: String? = null
)

@Serializable
data class UpdateTicketRequest(
    val title: String? = null,
    val description: String? = null,
    val category: String? = null,
    val issue: String? = null,
    val issueHead: String? = null,
    val priority: String? = null,
    val status: String? = null,
    val assignedTo: String? = null,
    val assignedToName: String? = null
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

// ─── ISSUES HIERARCHY (Base Issue Head & Department-Mapped Sub-Issues) ─────────
@Serializable
data class IssueHead(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val name: String,
    val icon: String = "📂",
    val description: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class IssueHeadPublic(
    val id: String,
    val name: String,
    val icon: String,
    val description: String,
    val createdAt: Long
)

fun IssueHead.toPublic() = IssueHeadPublic(
    id = id.toHexString(),
    name = name,
    icon = icon,
    description = description,
    createdAt = createdAt
)

@Serializable
data class CreateIssueHeadRequest(
    val name: String,
    val icon: String = "📂",
    val description: String = ""
)

@Serializable
data class SubIssue(
    @Contextual
    @SerialName("_id")
    val id: ObjectId = ObjectId(),
    val headId: String,
    val headName: String,
    val department: String,
    val name: String,
    val priority: String = "Medium",
    val description: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class SubIssuePublic(
    val id: String,
    val headId: String,
    val headName: String,
    val department: String,
    val name: String,
    val priority: String = "Medium",
    val description: String,
    val createdAt: Long
)

fun SubIssue.toPublic() = SubIssuePublic(
    id = id.toHexString(),
    headId = headId,
    headName = headName,
    department = department,
    name = name,
    priority = priority,
    description = description,
    createdAt = createdAt
)

@Serializable
data class CreateSubIssueRequest(
    val headId: String,
    val department: String,
    val name: String,
    val priority: String = "Medium",
    val description: String = ""
)

@Serializable
data class UpdateSubIssueRequest(
    val name: String? = null,
    val department: String? = null,
    val priority: String? = null,
    val description: String? = null
)

@Serializable
data class IssueTreeNode(
    val head: IssueHeadPublic,
    val subIssues: List<SubIssuePublic>
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
    val totalCategories: Int,
    val totalDepartments: Int = 0
)

// ─── ACTIVE DIRECTORY SYNC STATUS ──────────────────────────────────
@Serializable
data class AdStatusResponse(
    val host: String,
    val port: Int,
    val useSsl: Boolean,
    val baseDn: String,
    val syncMinutes: Long,
    val lastSyncAt: Long? = null,
    val lastSyncCount: Int = 0,
    val lastSyncStatus: String = "Idle",
    val lastError: String? = null,
    val isSyncing: Boolean = false,
    val totalAdUsers: Int = 0,
    val activeAdUsers: Int = 0,
    val totalDepartments: Int = 0,
    val lastNewUsers: List<String> = emptyList()
)
