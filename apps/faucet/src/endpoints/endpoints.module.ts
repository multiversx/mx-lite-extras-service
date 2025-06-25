import { Module } from '@nestjs/common';
import { DynamicModuleUtils } from '@libs/common';
import { FaucetModule } from './faucet/faucet.module';
import { PasskeysModule } from './passkeys/passkeys.module';

@Module({
  imports: [
    DynamicModuleUtils.getApiModule(),
    DynamicModuleUtils.getCachingModule(),
    FaucetModule,
    PasskeysModule
  ],
  providers: [
    DynamicModuleUtils.getNestJsApiConfigService(),
  ],
})

export class EndpointsModule { }
