import type { AaModelSnapshot } from "@/lib/aa/types";

export function providerSlugFor(model: AaModelSnapshot): string {
  return model.openrouter_api_id ?? model.provider_slug;
}
