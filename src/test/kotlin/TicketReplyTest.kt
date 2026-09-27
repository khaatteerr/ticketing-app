package com.eraqi.ticketing

import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlin.test.*

class TicketReplyTest {
    @Test
    fun `old tickets default to an empty public conversation`() {
        val ticket = Ticket(ticketId = "TKT-1", title = "Printer", category = "IT", submittedBy = "alice", submittedByName = "Alice")
        assertTrue(ticket.toPublic().replies.isEmpty())
        val json = Json.encodeToString(ticket.toPublic())
        assertTrue(Json.decodeFromString<TicketPublic>(json).replies.isEmpty())
    }

    @Test
    fun `reply identity content and time survive public serialization`() {
        val reply = TicketReply(authorUsername = "sam", authorName = "Sam", message = "Fixed printer.\nPlease retry.", createdAt = 123L)
        val ticket = Ticket(ticketId = "TKT-1", title = "Printer", category = "IT", submittedBy = "alice", submittedByName = "Alice", replies = listOf(reply))
        val decoded = Json.decodeFromString<TicketPublic>(Json.encodeToString(ticket.toPublic()))
        assertEquals(listOf(reply), decoded.replies)
    }
}
