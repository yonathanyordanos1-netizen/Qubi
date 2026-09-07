import { AppConfig } from './config';

/**
 * The dev/update server. Hosts the latest build plus a `version.json`
 * manifest describing what is available. Ported from update_service.dart.
 */

/** Version info advertised by the update server's `version.json`. */
export class UpdateInfo {
  constructor(
    public readonly appName: string,
    public readonly version: string,
    public readonly buildNumber: string,
    public readonly packageName: string,
  ) {}

  /** True when this advertised version is newer than [localVersion]. */
  isNewerThan(localVersion: string, localBuildNumber?: string): boolean {
    const cmp = compareParts(parts(this.version), parts(localVersion));
    if (cmp !== 0) return cmp > 0;
    const localBuild = Number.parseInt(localBuildNumber ?? '', 10) || 0;
    const remoteBuild = Number.parseInt(this.buildNumber, 10) || 0;
    return remoteBuild > localBuild;
  }

  static fromJson(json: Record<string, unknown>): UpdateInfo {
    return new UpdateInfo(
      (json['app_name'] as string) ?? '',
      (json['version'] as string) ?? '0.0.0',
      (json['build_number'] as string) ?? '0',
      (json['package_name'] as string) ?? '',
    );
  }
}

function parts(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((p) => {
      const n = Number.parseInt(p.trim(), 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Semantic version comparison. Returns >0 if a is newer, <0 if older, 0 when equal. */
function compareParts(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = i < a.length ? a[i] : 0;
    const y = i < b.length ? b[i] : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Fetches the current advertised version from the update server.
 * Returns null on any failure so the caller can stay silent.
 */
export async function fetchLatestUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`${AppConfig.updateServerUrl}/version.json`);
    if (res.status !== 200) return null;
    const decoded: unknown = await res.json();
    if (typeof decoded !== 'object' || decoded == null) return null;
    return UpdateInfo.fromJson(decoded as Record<string, unknown>);
  } catch {
    return null;
  }
}
