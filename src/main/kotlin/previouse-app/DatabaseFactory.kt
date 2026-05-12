package com.helpdesk.database

import com.helpdesk.models.Category
import com.helpdesk.models.Ticket
import com.helpdesk.models.User
import io.ktor.server.config.*
import org.litote.kmongo.coroutine.CoroutineCollection
import org.litote.kmongo.coroutine.CoroutineDatabase
import org.litote.kmongo.coroutine.coroutine
import org.litote.kmongo.reactivestreams.KMongo
import org.mindrot.jbcrypt.BCrypt
import org.slf4j.LoggerFactory

object DatabaseFactory {

    private val logger = LoggerFactory.getLogger("DatabaseFactory")

    lateinit var db: CoroutineDatabase
    lateinit var users: CoroutineCollection<User>
    lateinit var tickets: CoroutineCollection<Ticket>
    lateinit var categories: CoroutineCollection<Category>

    fun init(config: ApplicationConfig) {
        val connectionString = config.tryGetString("mongodb.connectionString")
            ?: "mongodb://localhost:27017"
        val dbName = config.tryGetString("mongodb.database") ?: "helpdesk"

        logger.info("Connecting to MongoDB at $connectionString, database: $dbName")

        val client = KMongo.createClient(connectionString).coroutine
        db = client.getDatabase(dbName)

        users      = db.getCollection()
        tickets    = db.getCollection()
        categories = db.getCollection()

        logger.info("MongoDB connected successfully")

        // Seed default categories and admin user
        kotlinx.coroutines.runBlocking {
            seedDefaults()
        }
    }

    private suspend fun seedDefaults() {
        // Create default admin if no users exist
        if (users.countDocuments() == 0L) {
            val adminHash = BCrypt.hashpw("admin123", BCrypt.gensalt())
            users.insertOne(
                User(
                    username = "admin",
                    name = "System Admin",
                    passwordHash = adminHash,
                    role = "Admin"
                )
            )
            logger.info("Default admin user created: username=admin password=admin123")
        }

        // Create default categories if none exist
        if (categories.countDocuments() == 0L) {
            val defaults = listOf(
                Category(name = "Hardware & Devices",      icon = "🖥️"),
                Category(name = "Software & Applications", icon = "💻"),
                Category(name = "Network & Internet",      icon = "🌐"),
                Category(name = "Email & Communication",   icon = "📧"),
                Category(name = "Security & Access",       icon = "🔒"),
                Category(name = "General IT Support",      icon = "🔧"),
            )
            categories.insertMany(defaults)
            logger.info("Default categories created")
        }
    }
}
