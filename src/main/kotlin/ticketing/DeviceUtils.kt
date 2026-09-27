package com.eraqi.ticketing

import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.origin
import io.ktor.server.request.header

object DeviceUtils {

    /**
     * Parses a friendly, readable device and browser name from a User-Agent header string.
     * Examples: "Windows 10/11 (Chrome)", "iPhone (Safari)", "Android (SM-S918B) (Chrome)", "Mac (Safari)"
     */
    fun parseDevice(userAgent: String?): String {
        if (userAgent.isNullOrBlank()) return "Unknown Device"

        // Operating System detection
        val os = when {
            userAgent.contains("Windows NT 10.0", ignoreCase = true) -> "Windows 10/11"
            userAgent.contains("Windows NT 6.3", ignoreCase = true) -> "Windows 8.1"
            userAgent.contains("Windows NT 6.2", ignoreCase = true) -> "Windows 8"
            userAgent.contains("Windows NT 6.1", ignoreCase = true) -> "Windows 7"
            userAgent.contains("Windows", ignoreCase = true) -> "Windows PC"
            userAgent.contains("iPhone", ignoreCase = true) -> "iPhone"
            userAgent.contains("iPad", ignoreCase = true) -> "iPad"
            userAgent.contains("Macintosh", ignoreCase = true) || userAgent.contains("Mac OS X", ignoreCase = true) -> "Mac"
            userAgent.contains("Android", ignoreCase = true) -> {
                val match = Regex("""Android[^;]*;\s*([^;)]+)""").find(userAgent)
                val model = match?.groupValues?.getOrNull(1)?.trim()
                if (!model.isNullOrBlank()) "Android ($model)" else "Android"
            }
            userAgent.contains("Linux", ignoreCase = true) -> "Linux PC"
            userAgent.contains("CrOS", ignoreCase = true) -> "ChromeOS"
            else -> "Other Device"
        }

        // Browser detection
        val browser = when {
            userAgent.contains("Edg/", ignoreCase = true) -> "Edge"
            userAgent.contains("Chrome/", ignoreCase = true) && !userAgent.contains("Edg/", ignoreCase = true) && !userAgent.contains("OPR/", ignoreCase = true) -> "Chrome"
            userAgent.contains("Firefox/", ignoreCase = true) -> "Firefox"
            userAgent.contains("Safari/", ignoreCase = true) && !userAgent.contains("Chrome/", ignoreCase = true) && !userAgent.contains("Android", ignoreCase = true) -> "Safari"
            userAgent.contains("OPR/", ignoreCase = true) || userAgent.contains("Opera", ignoreCase = true) -> "Opera"
            else -> null
        }

        return if (browser != null) "$os ($browser)" else os
    }

    /**
     * Extracts the client IP address from request headers or remote connection host.
     */
    fun getClientIp(call: ApplicationCall): String {
        val forwarded = call.request.header("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
        if (!forwarded.isNullOrBlank()) return forwarded
        val realIp = call.request.header("X-Real-IP")?.trim()
        if (!realIp.isNullOrBlank()) return realIp
        val host = runCatching { call.request.origin.remoteHost }.getOrNull()
            ?: call.request.local.remoteHost
        return if (host == "0:0:0:0:0:0:0:1") "127.0.0.1" else host
    }
}
