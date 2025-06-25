import { ApiProperty } from '@nestjs/swagger';
import {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';

export class PassKeyRegistrationDto {
  @ApiProperty()
  registrationResponse!: RegistrationResponseJSON;

  @ApiProperty()
  challenge!: string;

  @ApiProperty()
  passKeyId!: string;
}

export class PassKeyAuthenticationDto {
  @ApiProperty()
  authenticationResponse!: AuthenticationResponseJSON;

  @ApiProperty()
  challenge!: string;

  @ApiProperty()
  passKeyId!: string;
}
