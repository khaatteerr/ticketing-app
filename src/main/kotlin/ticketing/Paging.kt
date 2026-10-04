package com.eraqi.ticketing

import com.mongodb.client.model.Filters
import com.mongodb.client.model.Sorts
import io.ktor.http.Parameters
import kotlinx.serialization.Serializable
import org.bson.Document
import org.bson.conversions.Bson
import org.litote.kmongo.coroutine.CoroutineCollection
import java.util.regex.Pattern

@Serializable
data class Pagination(val page: Int, val pageSize: Int, val total: Long, val totalPages: Int)

data class PageQuery(val page: Int, val pageSize: Int, val sort: Bson) {
    companion object {
        fun parse(params: Parameters, allowed: Set<String>, defaultSort: String = "name", defaultOrder: String = "asc"): PageQuery {
            val page = params["page"]?.toIntOrNull()?.coerceIn(1, 1_000_000) ?: 1
            val size = params["pageSize"]?.toIntOrNull()?.coerceIn(1, 100) ?: 25
            val field = params["sort"]?.takeIf { it in allowed } ?: defaultSort
            val descending = (params["order"] ?: defaultOrder) == "desc"
            return PageQuery(page, size, Sorts.orderBy(if (descending) Sorts.descending(field) else Sorts.ascending(field), Sorts.ascending("_id")))
        }
    }
    fun metadata(total: Long): Pagination {
        val pages = ((total + pageSize - 1) / pageSize).coerceIn(1, Int.MAX_VALUE.toLong()).toInt()
        return Pagination(page.coerceAtMost(pages), pageSize, total, pages)
    }
}

fun queryFilter(params: Parameters, searchFields: List<String>, exactFields: Map<String, String> = emptyMap(), extra: List<Bson> = emptyList()): Bson {
    val filters = extra.toMutableList()
    params["search"]?.trim()?.take(120)?.takeIf { it.isNotBlank() }?.let { search ->
        filters += Filters.or(searchFields.map { Filters.regex(it, Pattern.quote(search), "i") })
    }
    exactFields.forEach { (parameter, field) ->
        params[parameter]?.takeIf { it.isNotBlank() }?.let { filters += Filters.eq(field, it) }
    }
    return if (filters.isEmpty()) Document() else Filters.and(filters)
}

suspend fun <T : Any, R> CoroutineCollection<T>.pageResponse(query: PageQuery, filter: Bson, transform: (T) -> R): ApiResponse<List<R>> {
    val meta = query.metadata(countDocuments(filter))
    val records = find(filter).sort(query.sort).skip((meta.page - 1) * meta.pageSize).limit(meta.pageSize).toList()
    return ApiResponse(success = true, data = records.map(transform), pagination = meta)
}

suspend fun <T : Any> CoroutineCollection<T>.groupCounts(field: String, filter: Bson = Document()): Map<String, Long> =
    aggregate<Document>(listOf(Document("\$match", bsonDocument(filter)), Document("\$group", Document("_id", "\$$field").append("count", Document("\$sum", 1)))))
        .toList().associate { (it["_id"]?.toString() ?: "") to (it["count"] as Number).toLong() }

suspend fun issueHeadPage(params: Parameters): ApiResponse<List<IssueHeadPublic>> {
    val query = PageQuery.parse(params, setOf("name", "createdAt"))
    val pipeline = mutableListOf<Bson>()
    val department = params["department"]?.takeIf { it.isNotBlank() }
    val search = params["search"]?.trim()?.take(120)?.takeIf { it.isNotBlank() }
    val subFilter = queryFilter(params, listOf("name", "headName", "department", "priority", "description"), mapOf("department" to "department"))
    if (department != null || search != null) {
        pipeline += Document("\$lookup", Document("from", "subIssues")
            .append("let", Document("head", Document("\$toString", "\$_id")))
            .append("pipeline", listOf(
                Document("\$match", bsonDocument(Filters.and(subFilter, Document("\$expr", Document("\$eq", listOf("\$headId", "\$\$head")))))),
                Document("\$limit", 1), Document("\$project", Document("_id", 1))))
            .append("as", "matchingSubs"))
        val matched = Filters.exists("matchingSubs.0")
        pipeline += Document("\$match", bsonDocument(if (department != null) matched else Filters.or(matched, queryFilter(params, listOf("name", "description")))))
    }
    val total = DatabaseFactory.issueHeads.aggregate<Document>(pipeline + Document("\$count", "total")).first()?.get("total") as? Number
    val meta = query.metadata(total?.toLong() ?: 0)
    val heads = DatabaseFactory.issueHeads.aggregate<IssueHead>(pipeline + listOf(
        Document("\$sort", bsonDocument(query.sort)), Document("\$skip", (meta.page - 1) * meta.pageSize), Document("\$limit", meta.pageSize), Document("\$project", Document("matchingSubs", 0))
    )).toList()
    return ApiResponse(success = true, data = heads.map { it.toPublic() }, pagination = meta)
}

// Preserve configured priorities without rewriting historical tickets. Ordinary
// requests resolve only the requested page; priority filters/sorts resolve in DB.
internal fun ticketQueryPlan(params: Parameters, access: Bson): TicketQueryPlan {
    val filter = queryFilter(params,
        listOf("title", "ticketId", "submittedBy", "submittedByName", "submittedByDepartment", "assignedTo", "assignedToName"),
        mapOf("status" to "status", "department" to "submittedByDepartment", "category" to "category", "assignedTo" to "assignedTo"), listOf(access))
    val query = PageQuery.parse(params, setOf("ticketId", "title", "submittedBy", "submittedByDepartment", "issue", "priority", "status", "assignedTo", "createdAt", "updatedAt"), "createdAt", "desc")
    val lookup = listOf(
        Document("\$lookup", Document("from", "subIssues").append("let", Document("issue", "\$issue"))
            .append("pipeline", listOf(Document("\$match", Document("\$expr", Document("\$eq", listOf("\$name", "\$\$issue")))), Document("\$sort", Document("_id", 1)), Document("\$limit", 1), Document("\$project", Document("priority", 1))))
            .append("as", "configuredIssue")),
        Document("\$set", Document("priority", Document("\$ifNull", listOf(Document("\$arrayElemAt", listOf("\$configuredIssue.priority", 0)), "\$priority")))),
        Document("\$project", Document("configuredIssue", 0))
    )
    val pipeline = mutableListOf<Bson>(Document("\$match", bsonDocument(filter)))
    val priority = params["priority"]?.takeIf { it.isNotBlank() }
    if (priority != null) {
        pipeline += lookup
        pipeline += Document("\$match", bsonDocument(Filters.eq("priority", priority)))
    }
    val resolveBeforeSort = priority == null && params["sort"] == "priority"
    return TicketQueryPlan(query, filter, pipeline, lookup, priority != null, resolveBeforeSort)
}

internal data class TicketQueryPlan(
    val query: PageQuery, val filter: Bson, val matched: List<Bson>, val lookup: List<Bson>,
    val priorityFiltered: Boolean, val prioritySorted: Boolean
) {
    fun records(meta: Pagination): List<Bson> = matched +
        (if (prioritySorted) lookup else emptyList()) +
        listOf(Document("\$sort", bsonDocument(query.sort)), Document("\$skip", (meta.page - 1) * meta.pageSize), Document("\$limit", meta.pageSize)) +
        (if (!priorityFiltered && !prioritySorted) lookup else emptyList())
}

suspend fun ticketPage(params: Parameters, access: Bson): ApiResponse<List<TicketPublic>> {
    val plan = ticketQueryPlan(params, access)
    val total = if (!plan.priorityFiltered) DatabaseFactory.tickets.countDocuments(plan.filter) else
        (DatabaseFactory.tickets.aggregate<Document>(plan.matched + Document("\$count", "total")).first()?.get("total") as? Number)?.toLong() ?: 0L
    val meta = plan.query.metadata(total)
    val records = DatabaseFactory.tickets.aggregate<Ticket>(plan.records(meta)).allowDiskUse(true).toList()
    return ApiResponse(success = true, data = records.map { it.toPublic() }, pagination = meta)
}

internal fun bsonDocument(value: Bson) = value.toBsonDocument(Document::class.java, com.mongodb.MongoClientSettings.getDefaultCodecRegistry())
