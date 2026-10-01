package com.xecute.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.xecute.app.data.dao.AppSwitchEventDao
import com.xecute.app.data.dao.BlocklistDao
import com.xecute.app.data.dao.LockSessionDao
import com.xecute.app.data.dao.SyncQueueDao
import com.xecute.app.data.dao.TamperEventDao
import com.xecute.app.data.dao.XCreditsWalletDao
import com.xecute.app.data.entity.AppSwitchEventEntity
import com.xecute.app.data.entity.BlockedAppEntity
import com.xecute.app.data.entity.BlockedDomainEntity
import com.xecute.app.data.entity.LockSessionEntity
import com.xecute.app.data.entity.SyncQueueEntity
import com.xecute.app.data.entity.TamperEventEntity
import com.xecute.app.data.entity.XCreditsWalletEntity

@Database(
    entities = [
        BlockedAppEntity::class,
        BlockedDomainEntity::class,
        LockSessionEntity::class,
        AppSwitchEventEntity::class,
        XCreditsWalletEntity::class,
        SyncQueueEntity::class,
        TamperEventEntity::class,
    ],
    version = 3,
    exportSchema = false,
)
abstract class XecuteDatabase : RoomDatabase() {
    abstract fun blocklistDao(): BlocklistDao
    abstract fun lockSessionDao(): LockSessionDao
    abstract fun appSwitchEventDao(): AppSwitchEventDao
    abstract fun xCreditsWalletDao(): XCreditsWalletDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun tamperEventDao(): TamperEventDao

    companion object {
        @Volatile
        private var INSTANCE: XecuteDatabase? = null

        fun getInstance(context: Context): XecuteDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    XecuteDatabase::class.java,
                    "xecute.db",
                ).fallbackToDestructiveMigration().build().also { INSTANCE = it }
            }
        }
    }
}
