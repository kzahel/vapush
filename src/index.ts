/**
 * vapush - Minimal self-hosted VAPID web push notifications
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import webPush from "web-push";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface Subscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface StoredSubscription {
  subscription: Subscription;
  createdAt: string;
  name?: string;
}

export interface VapushOptions {
  dataDir?: string;
  subject?: string;
}

export class Vapush {
  private dataDir: string;
  private subject: string;
  private keys: VapidKeys | null = null;
  private subscriptions: Record<string, StoredSubscription> = {};

  constructor(options: VapushOptions = {}) {
    this.dataDir = options.dataDir ?? path.join(process.cwd(), ".vapush");
    this.subject = options.subject ?? "mailto:vapush@localhost";
  }

  /** Initialize - load or generate keys, load subscriptions */
  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    this.keys = await this.loadOrCreateKeys();
    webPush.setVapidDetails(this.keys.subject, this.keys.publicKey, this.keys.privateKey);
    await this.loadSubscriptions();
  }

  /** Get the public key for client subscription */
  getPublicKey(): string {
    if (!this.keys) throw new Error("Not initialized");
    return this.keys.publicKey;
  }

  /** Add a subscription */
  async subscribe(id: string, subscription: Subscription, name?: string): Promise<void> {
    this.subscriptions[id] = {
      subscription,
      createdAt: new Date().toISOString(),
      name,
    };
    await this.saveSubscriptions();
  }

  /** Remove a subscription */
  async unsubscribe(id: string): Promise<boolean> {
    if (!this.subscriptions[id]) return false;
    delete this.subscriptions[id];
    await this.saveSubscriptions();
    return true;
  }

  /** Get all subscriptions */
  getSubscriptions(): Record<string, StoredSubscription> {
    return { ...this.subscriptions };
  }

  /** Send a push notification to all subscribers */
  async push(title: string, body: string, url?: string): Promise<{ success: number; failed: number }> {
    const payload = JSON.stringify({ title, body, url });
    const ids = Object.keys(this.subscriptions);
    let success = 0;
    let failed = 0;
    const toRemove: string[] = [];

    await Promise.all(
      ids.map(async (id) => {
        try {
          await webPush.sendNotification(this.subscriptions[id].subscription, payload);
          success++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            toRemove.push(id);
          }
          failed++;
        }
      })
    );

    // Clean up expired subscriptions
    for (const id of toRemove) {
      delete this.subscriptions[id];
    }
    if (toRemove.length > 0) {
      await this.saveSubscriptions();
    }

    return { success, failed };
  }

  /** Send to a specific subscriber */
  async pushTo(id: string, title: string, body: string, url?: string): Promise<boolean> {
    const stored = this.subscriptions[id];
    if (!stored) return false;

    const payload = JSON.stringify({ title, body, url });
    try {
      await webPush.sendNotification(stored.subscription, payload);
      return true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        delete this.subscriptions[id];
        await this.saveSubscriptions();
      }
      return false;
    }
  }

  private async loadOrCreateKeys(): Promise<VapidKeys> {
    const keyFile = path.join(this.dataDir, "vapid.json");
    try {
      const content = await fs.readFile(keyFile, "utf-8");
      return JSON.parse(content);
    } catch {
      const { publicKey, privateKey } = webPush.generateVAPIDKeys();
      const keys: VapidKeys = { publicKey, privateKey, subject: this.subject };
      await fs.writeFile(keyFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
      return keys;
    }
  }

  private async loadSubscriptions(): Promise<void> {
    const subFile = path.join(this.dataDir, "subscriptions.json");
    try {
      const content = await fs.readFile(subFile, "utf-8");
      this.subscriptions = JSON.parse(content);
    } catch {
      this.subscriptions = {};
    }
  }

  private async saveSubscriptions(): Promise<void> {
    const subFile = path.join(this.dataDir, "subscriptions.json");
    await fs.writeFile(subFile, JSON.stringify(this.subscriptions, null, 2));
  }
}

export default Vapush;
