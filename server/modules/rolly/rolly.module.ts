import { Module } from '@nestjs/common';
import { RollyController } from './rolly.controller';
import { RollyService } from './rolly.service';

@Module({
  controllers: [RollyController],
  providers: [RollyService],
})
export class RollyModule {}