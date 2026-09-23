import { Server as SocketIOServer } from 'socket.io';
import { GatewayMetricEvent } from './types.js';

export class MetricsPublisher {
  private io?: SocketIOServer;

  attach(io: SocketIOServer): void {
    this.io = io;
  }

  emit(event: GatewayMetricEvent): void {
    if (!this.io) return;
    this.io.emit('gateway-metric', event);
  }
}

export const metricsPublisher = new MetricsPublisher();
