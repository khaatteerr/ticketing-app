package com.eraqi.ticketing

import io.ktor.server.config.*
import kotlinx.coroutines.runBlocking
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
    lateinit var departments: CoroutineCollection<Department>
    lateinit var issueHeads: CoroutineCollection<IssueHead>
    lateinit var subIssues: CoroutineCollection<SubIssue>

    // Shared LdapService instance, set once by setupAd() during startup.
    // authRoutes() and any admin "sync now" endpoint read it from here.
    lateinit var ldap: LdapService

    fun isLdapInitialized(): Boolean = ::ldap.isInitialized

    fun init(config: ApplicationConfig) {
        val connectionString = config.tryGetString("mongo.connectionString")
            ?: "mongodb+srv://ahmederaqi252_db_user:Vo16bylNaLItbPQU@cluster0.a6klah9.mongodb.net/?appName=Cluster0"
        val dbName = config.tryGetString("mongo.database") ?: "helpdesk"

        logger.info("Connecting to MongoDB, database: $dbName")

        val client = KMongo.createClient(connectionString).coroutine
        db = client.getDatabase(dbName)

        users       = db.getCollection(collectionName = "users")
        tickets     = db.getCollection()
        categories  = db.getCollection()
        departments = db.getCollection(collectionName = "departments")
        issueHeads  = db.getCollection(collectionName = "issueHeads")
        subIssues   = db.getCollection(collectionName = "subIssues")

        logger.info("MongoDB connected successfully")

        // Seed default categories and a local admin fallback account
        runBlocking {
            ensureQueryIndexes()
            seedDefaults()
        }
    }

    private suspend fun seedDefaults() {
        // Local emergency admin — only created if the users collection is completely empty.
        if (users.countDocuments() == 0L) {
            val adminHash = BCrypt.hashpw("admin123", BCrypt.gensalt())
            users.insertOne(
                User(
                    username = "admin",
                    name = "System Admin",
                    passwordHash = adminHash,
                    source = "LOCAL",
                    role = "Admin"
                )
            )
            logger.info("Default local admin created: username=admin password=admin123 (change this password)")
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

        // Seed default Issue Heads if none exist
        if (issueHeads.countDocuments() == 0L) {
            val defaultHeads = listOf(
                IssueHead(name = "Hardware",        icon = "🖥️", description = "Physical device and hardware problems"),
                IssueHead(name = "Software",        icon = "💻", description = "Application and system software issues"),
                IssueHead(name = "Network",         icon = "🌐", description = "Connectivity and network-related problems"),
                IssueHead(name = "Email & Phones",  icon = "📞", description = "Email, phone, and communication issues"),
                IssueHead(name = "Access & Security", icon = "🔒", description = "Login, passwords, and access permissions")
            )
            issueHeads.insertMany(defaultHeads)
            logger.info("Default issue heads created")
        }

        // Initialize / sync department stats in MongoDB
        runCatching {
            recalculateDepartmentStats(db)
        }.onFailure {
            logger.warn("Could not recalculate initial department stats: ${it.message}")
        }
    }
}

