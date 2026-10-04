package com.eraqi.ticketing

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.mongodb.client.model.Filters
import io.ktor.http.Parameters
import io.ktor.server.auth.jwt.JWTPrincipal
import org.bson.Document
import kotlin.test.*

class PagingTest {
    private fun params(vararg values: Pair<String, String>) = Parameters.build { values.forEach { append(it.first, it.second) } }
    private fun principal(role: String = "User") = JWTPrincipal(JWT.decode(JWT.create().withClaim("username", "alice").withClaim("role", role).sign(Algorithm.HMAC256("test-only"))))

    @Test fun `paging is bounded and out of range pages clamp to last page`() {
        val query = PageQuery.parse(params("page" to "999999999", "pageSize" to "100000", "sort" to "passwordHash"), setOf("name"))
        assertEquals(100, query.pageSize)
        assertEquals(1_000_000, query.page)
        assertEquals(Pagination(3, 100, 201, 3), query.metadata(201))
        assertEquals(Pagination(1, 100, 0, 1), query.metadata(0))
        assertEquals(1, PageQuery.parse(params("page" to "-4", "pageSize" to "0"), setOf("name")).pageSize)
        assertEquals(25, PageQuery.parse(params("pageSize" to "oops"), setOf("name")).pageSize)
        assertEquals("{\"name\": 1, \"_id\": 1}", bsonDocument(query.sort).toJson())
    }

    @Test fun `search treats regex syntax literally and exact filters are ANDed with access`() {
        val filter = queryFilter(params("search" to ".*", "assignedTo" to "bob"), listOf("title"), mapOf("assignedTo" to "assignedTo"), listOf(ticketAccessFilter(principal(), null)))
        val json = bsonDocument(filter).toJson()
        assertTrue(json.contains("\\\\Q.*\\\\E"), json)
        assertTrue(json.contains("alice"), json)
        assertTrue(json.contains("bob"), json)
        assertTrue(json.contains("\$and"), json)
        assertFalse(bsonDocument(ticketAccessFilter(principal("Admin"), "assigned")).toJson().contains("bob"))
        assertEquals(Document("assignedTo", "alice").toBsonDocument(), bsonDocument(ticketAccessFilter(principal("Admin"), "assigned")))
        assertEquals(Document("submittedBy", "alice").toBsonDocument(), bsonDocument(ticketAccessFilter(principal(), "submitted")))
        assertTrue(bsonDocument(ticketAccessFilter(principal("Admin"), null)).isEmpty())
    }

    @Test fun `ordinary ticket page limits rows before resolving configured priorities`() {
        val plan = ticketQueryPlan(params("page" to "2", "pageSize" to "10", "status" to "Open", "department" to "IT"), ticketAccessFilter(principal(), null))
        val stages = plan.records(plan.query.metadata(31)).map(::bsonDocument)
        // Encoding every stage catches accidental embedding of unencodable Bson builders.
        stages.forEach { assertTrue(it.toJson().isNotEmpty()) }
        assertTrue(stages.indexOfFirst { it.containsKey("\$limit") } < stages.indexOfFirst { it.containsKey("\$lookup") })
        assertEquals(10, stages.first { it.containsKey("\$skip") }["\$skip"]!!.asInt32().value)
        assertEquals(10, stages.first { it.containsKey("\$limit") }["\$limit"]!!.asInt32().value)
        assertTrue(bsonDocument(plan.filter).toJson().contains("IT"))
        assertFalse(plan.priorityFiltered)
    }

    @Test fun `priority filter and sort are resolved before pagination inside database`() {
        for (params in listOf(params("priority" to "High"), params("sort" to "priority", "order" to "desc"))) {
            val plan = ticketQueryPlan(params, Filters.eq("submittedBy", "alice"))
            val stages = plan.records(plan.query.metadata(100)).map(::bsonDocument)
            stages.forEach { it.toJson() }
            assertTrue(stages.indexOfFirst { it.containsKey("\$lookup") } < stages.indexOfFirst { it.containsKey("\$skip") })
            assertEquals(1, stages.count { it.containsKey("\$lookup") })
            if (plan.priorityFiltered) assertTrue(plan.matched.map(::bsonDocument).last().toJson().contains("High"))
        }
    }
}
