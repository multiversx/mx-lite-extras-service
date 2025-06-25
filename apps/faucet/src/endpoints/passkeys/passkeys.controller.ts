import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { PasskeysService } from './passkeys.service';
import {
  PassKeyAuthenticationDto,
  PassKeyRegistrationDto,
} from './passkey.dto';

@Controller('passkeys')
export class PasskeysController {
  constructor(private readonly passkeysService: PasskeysService) {}

  @Get('register/options')
  async registerOptions() {
    return this.passkeysService.registerOptions();
  }

  @Post('register/verify')
  async registerVerify(
    @Body() body: PassKeyRegistrationDto,
    @Headers('origin') origin: string,
  ) {
    return this.passkeysService.registerVerify({ ...body, origin });
  }

  @Get('authentication/options')
  authenticationOptions() {
    return this.passkeysService.authenticationOptions();
  }

  @Post('authentication/verify')
  authenticationVerify(
    @Body() body: PassKeyAuthenticationDto,
    @Headers('origin') origin: string,
  ) {
    return this.passkeysService.authenticationVerify(body, origin);
  }

  @Get('challenge')
  async challenge() {
    return this.passkeysService.generateChallenge();
  }
}
