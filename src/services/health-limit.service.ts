import { prisma } from '../lib/prisma';

class HealthLimitService {
  async check2HourLimit(userId: string): Promise<boolean> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const pomodoros = await prisma.pomodoro.findMany({
      where: {
        userId,
        endTime: { gte: twoHoursAgo },
        status: 'COMPLETED'
      }
    });

    const totalMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

    const settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    const limit = settings?.healthLimit2Hours ?? 110;
    return totalMinutes >= limit;
  }

  async checkDailyLimit(userId: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const pomodoros = await prisma.pomodoro.findMany({
      where: {
        userId,
        endTime: { gte: startOfDay },
        status: 'COMPLETED'
      }
    });

    const totalMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

    const settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    const limit = settings?.healthLimitDaily ?? 600;
    return totalMinutes >= limit;
  }

  async checkHealthLimit(userId: string): Promise<{
    exceeded: boolean;
    type: '2hours' | 'daily' | null;
  }> {
    const twoHourExceeded = await this.check2HourLimit(userId);
    if (twoHourExceeded) {
      return { exceeded: true, type: '2hours' };
    }

    const dailyExceeded = await this.checkDailyLimit(userId);
    if (dailyExceeded) {
      return { exceeded: true, type: 'daily' };
    }

    return { exceeded: false, type: null };
  }

  async canUseSkipToken(userId: string): Promise<{
    available: boolean;
    remaining: number;
  }> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (!settings) {
      return { available: false, remaining: 0 };
    }

    const remaining = settings.skipTokenWeeklyLimit - settings.skipTokenUsed;
    return {
      available: remaining > 0,
      remaining: Math.max(0, remaining)
    };
  }

  async consumeSkipToken(userId: string): Promise<{
    success: boolean;
    remaining: number;
  }> {
    const { available, remaining } = await this.canUseSkipToken(userId);

    if (!available) {
      return { success: false, remaining: 0 };
    }

    await prisma.userSettings.update({
      where: { userId },
      data: { skipTokenUsed: { increment: 1 } }
    });

    return { success: true, remaining: remaining - 1 };
  }

  async resetWeeklyTokens(userId: string): Promise<void> {
    const nextMonday = this.getNextMonday(new Date());

    await prisma.userSettings.update({
      where: { userId },
      data: {
        skipTokenUsed: 0,
        skipTokenResetAt: nextMonday
      }
    });
  }

  private getNextMonday(date: Date): Date {
    const result = new Date(date);
    const dayOfWeek = result.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    result.setDate(result.getDate() + daysUntilMonday);
    result.setHours(0, 0, 0, 0);
    return result;
  }
}

export const healthLimitService = new HealthLimitService();
