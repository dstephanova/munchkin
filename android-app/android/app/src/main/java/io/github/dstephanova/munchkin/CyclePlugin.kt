package io.github.dstephanova.munchkin

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId

// Reads period days that any tracker app saved to Health Connect. Read-only.
@CapacitorPlugin(name = "Cycle")
class CyclePlugin : Plugin() {
    private val perms = setOf(
        HealthPermission.getReadPermission(MenstruationPeriodRecord::class),
        HealthPermission.getReadPermission(MenstruationFlowRecord::class),
    )
    private lateinit var launcher: ActivityResultLauncher<Set<String>>
    private var pending: PluginCall? = null

    override fun load() {
        launcher = activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            pending?.resolve(JSObject().put("granted", granted.containsAll(perms)))
            pending = null
        }
    }

    private fun client(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(context) else null

    @PluginMethod
    fun status(call: PluginCall) {
        val c = client() ?: run { call.resolve(JSObject().put("available", false).put("granted", false)); return }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val g = c.permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("available", true).put("granted", g.containsAll(perms)))
            } catch (e: Exception) { call.reject(e.message ?: "status failed") }
        }
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (client() == null) { call.resolve(JSObject().put("granted", false)); return }
        pending = call
        activity.runOnUiThread { launcher.launch(perms) }
    }

    // Returns period days (YYYY-MM-DD) between startDate and endDate (ISO instants).
    @PluginMethod
    fun readPeriods(call: PluginCall) {
        val c = client() ?: run { call.reject("Health Connect not available"); return }
        val start = Instant.parse(call.getString("startDate"))
        val end = Instant.parse(call.getString("endDate"))
        val zone = ZoneId.systemDefault()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val days = sortedSetOf<String>()
                val range = TimeRangeFilter.between(start, end)
                val periods = c.readRecords(ReadRecordsRequest(MenstruationPeriodRecord::class, range))
                for (r in periods.records) {
                    var d = r.startTime.atZone(zone).toLocalDate()
                    val last = r.endTime.minusSeconds(1).atZone(zone).toLocalDate()
                    while (!d.isAfter(last)) { days.add(d.toString()); d = d.plusDays(1) }
                }
                val flows = c.readRecords(ReadRecordsRequest(MenstruationFlowRecord::class, range))
                for (r in flows.records) days.add(r.time.atZone(zone).toLocalDate().toString())
                val arr = JSArray(); days.forEach { arr.put(it) }
                call.resolve(JSObject().put("days", arr))
            } catch (e: Exception) { call.reject(e.message ?: "read failed") }
        }
    }
}
