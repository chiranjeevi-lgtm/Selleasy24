import { Module } from '@nestjs/common';
import { DevStorageController } from './dev-storage.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, DevStorageController],
})
export class HealthModule {}
