import { prisma } from "../db/prisma.js";
import crypto from "node:crypto";

// In-memory invite code store with 24h TTL
const inviteCodes = new Map<string, { familyId: string; ownerId: string; expiresAt: number }>();
const INVITE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function generateCode(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase(); // 12-char hex, ~281 trillion combinations
}

export async function createFamilyInvite(userId: string): Promise<string> {
  // Ensure user has a familyId (create one if not)
  let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.familyId) {
    user = await prisma.user.update({
      where: { id: userId },
      data: { familyId: userId, role: "owner" },
    });
  }

  // Remove any existing invite from this user
  for (const [code, data] of inviteCodes) {
    if (data.ownerId === userId) {
      inviteCodes.delete(code);
    }
  }

  const code = generateCode();
  inviteCodes.set(code, {
    familyId: user.familyId!,
    ownerId: userId,
    expiresAt: Date.now() + INVITE_TTL,
  });

  return code;
}

export async function joinFamily(userId: string, code: string): Promise<{ success: boolean; ownerName?: string; error?: string }> {
  const invite = inviteCodes.get(code.toUpperCase());

  if (!invite) {
    return { success: false, error: "Invalid or expired invite code." };
  }

  if (Date.now() > invite.expiresAt) {
    inviteCodes.delete(code.toUpperCase());
    return { success: false, error: "This invite code has expired." };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.familyId) {
    return { success: false, error: "You're already in a family. Use /leave first." };
  }

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: invite.ownerId } });

  await prisma.user.update({
    where: { id: userId },
    data: { familyId: invite.familyId, role: "member" },
  });

  return { success: true, ownerName: owner.firstName };
}

export async function leaveFamily(userId: string): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.familyId) {
    return { success: false, error: "You're not in a family." };
  }

  if (user.role === "owner") {
    // Check if other members exist
    const members = await prisma.user.findMany({
      where: { familyId: user.familyId, id: { not: userId } },
    });
    if (members.length > 0) {
      return { success: false, error: "You're the owner. Remove all members first, or transfer ownership." };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { familyId: null, role: "owner" },
  });

  return { success: true };
}

export async function getFamilyMemberIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.familyId) {
    return [userId];
  }

  const members = await prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { id: true },
  });

  return members.map((m) => m.id);
}

export async function getFamilyMembers(userId: string): Promise<Array<{ id: string; firstName: string; role: string }>> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.familyId) {
    return [{ id: user.id, firstName: user.firstName, role: user.role }];
  }

  return prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { id: true, firstName: true, role: true },
  });
}

// Cleanup expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of inviteCodes) {
    if (now > data.expiresAt) {
      inviteCodes.delete(code);
    }
  }
}, 60 * 60 * 1000); // every hour
