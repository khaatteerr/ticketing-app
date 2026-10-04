package com.eraqi.ticketing

import com.mongodb.client.model.Indexes.*

suspend fun ensureQueryIndexes() {
    with(DatabaseFactory) {
        tickets.createIndex(compoundIndex(descending("createdAt"), ascending("_id")))
        for (field in listOf("submittedBy", "assignedTo", "status", "submittedByDepartment"))
            tickets.createIndex(compoundIndex(ascending(field), descending("createdAt"), ascending("_id")))
        users.createIndex(ascending("username"))
        users.createIndex(ascending("name", "_id"))
        for (field in listOf("role", "active", "department")) users.createIndex(ascending(field, "name", "_id"))
        users.createIndex(compoundIndex(ascending("source"), descending("lastSyncedAt"), ascending("_id")))
        departments.createIndex(ascending("name", "_id"))
        issueHeads.createIndex(ascending("name", "_id"))
        subIssues.createIndex(ascending("name", "_id"))
        subIssues.createIndex(ascending("headId", "name", "_id"))
        subIssues.createIndex(ascending("department", "headId", "name", "_id"))
        categories.createIndex(ascending("name", "_id"))
    }
}
