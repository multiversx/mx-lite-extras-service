import { Module } from '@nestjs/common';
import { MongoDbPersistenceModule } from '../../helpers/persistence/mongodb/mongodb.persistence.module';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import { ChallengeStoreService } from './challenge-store.service';
import { DynamicModuleUtils } from '../../helpers/dynamic.module.utils';

@Module({
    imports: [
        MongoDbPersistenceModule,
        DynamicModuleUtils.getCacheModule(),
    ],
    controllers: [PasskeysController],
    providers: [PasskeysService, ChallengeStoreService],
    exports: [PasskeysService, ChallengeStoreService],
})
export class PasskeysModule { } 