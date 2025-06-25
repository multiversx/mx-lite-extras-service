import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MongoDbPersistenceService } from '../../helpers/persistence/mongodb/mongodb.persistence.service';
import { PasskeyAddressDb } from '../../helpers/persistence/mongodb/entities/passkey-address.db';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { ApiConfigService } from '../../helpers/api.config.service';
import { PassKeyAuthenticationDto } from './passkey.dto';
import {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import { OriginLogger } from '@multiversx/sdk-nestjs-common';

@Injectable()
export class PasskeysService {
  private readonly logger = new OriginLogger(PasskeysService.name);

  private readonly rpID: string;
  private readonly origin: string;
  private readonly rpName: string;

  constructor(
    private readonly databaseService: MongoDbPersistenceService,
    private readonly apiConfigService: ApiConfigService,
  ) {
    const passkeysConfig = this.apiConfigService.getPasskeysConfig();
    this.logger.log(`Passkeys service initialized with the following configuration: rpID:${passkeysConfig.rpId}. origin:${passkeysConfig.origin}. rpName:${passkeysConfig.rpName}`);
    this.rpID = passkeysConfig.rpId;
    this.origin = passkeysConfig.origin;
    this.rpName = passkeysConfig.rpName;
  }

  async registerOptions(): Promise<PublicKeyCredentialCreationOptionsJSON | null> {
    try {
      return await generateRegistrationOptions({
        rpName: this.rpName,
        rpID: this.rpID,
        userName:
          'multiversxWallet - ' + Math.random().toString(36).substring(2, 15),
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
          authenticatorAttachment: 'platform',
        },
        preferredAuthenticatorType: 'localDevice',
      });
    } catch {
      throw new InternalServerErrorException();
    }
  }

  async authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
    try {
      return await generateAuthenticationOptions({
        rpID: this.rpID,
        userVerification: 'required',
      });
    } catch {
      throw new InternalServerErrorException();
    }
  }

  async registerVerify({
    registrationResponse,
    challenge,
    passKeyId,
    origin,
  }: {
    registrationResponse: RegistrationResponseJSON;
    challenge: string;
    passKeyId: string;
    origin: string;
  }) {
    const verifiedResponse = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin?.trim() ?? this.origin,
      expectedRPID: this.rpID,
    });

    if (
      !verifiedResponse.verified ||
      !verifiedResponse.registrationInfo?.userVerified ||
      !verifiedResponse.registrationInfo?.credential.id ||
      !verifiedResponse.registrationInfo?.credential.publicKey
    ) {
      throw new InternalServerErrorException();
    }
    const isVerified = true;

    try {
      const passkey = new PasskeyAddressDb();
      passkey.passKeyId = passKeyId;
      passkey.publicAddress = Buffer.from(
        verifiedResponse.registrationInfo?.credential.publicKey,
      ).toString('hex');

      const dbPasskey =
        await this.databaseService.createPasskeyAddress(passkey);
      if (!dbPasskey) {
        throw new InternalServerErrorException();
      }

      return {
        isVerified,
      };
    } catch (e) {
      throw new InternalServerErrorException();
    }
  }

  async authenticationVerify({
    authenticationResponse,
    challenge,
    passKeyId,
  }: PassKeyAuthenticationDto, origin: string) {
    const passkey: PasskeyAddressDb | null =
      await this.databaseService.getPasskeyAddressByPasskeyId(passKeyId);

    if (!passkey) {
      throw new InternalServerErrorException('Passkey not found');
    }

    const publicKeyBuffer = Buffer.from(passkey?.publicAddress, 'hex');

    await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin?.trim() ?? this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.passKeyId,
        publicKey: new Uint8Array(publicKeyBuffer),
        counter: 0,
      },
    });

    const isVerified = true;

    return {
      isVerified,
    };
  }

  async generateChallenge() {
    try {
      // Generate a random challenge
      const challenge = randomBytes(32).toString('hex');
      return { challenge };
    } catch (error) {
      console.error('[Passkeys Service] Generate challenge failed:', error);
      throw new InternalServerErrorException('Failed to generate challenge');
    }
  }
}
