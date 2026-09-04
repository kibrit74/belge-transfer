import { describe, expect, it } from "vitest";
import { getGoogleSignInOptions, getNeonAccessToken, mapNeonUser } from "../auth/neon-client.js";

describe("Neon Auth istemcisi", () => {
  it("Google girişinden sonra istenen güvenli sayfaya döner", () => {
    expect(getGoogleSignInOptions("/transfer")).toEqual({
      provider: "google",
      callbackURL: "/transfer",
      errorCallbackURL: "/giris?error=oauth",
    });
  });

  it("uygulama dışına yönlendiren dönüş adresini profile düşürür", () => {
    expect(getGoogleSignInOptions("https://zararli.example").callbackURL).toBe("/profil");
  });

  it("mobil cihazın yerel ağ adresini OAuth dönüş adresine taşımaz", () => {
    const mobileOrigin = "http://192.168.1.50:5173";
    const options = getGoogleSignInOptions("/profil");

    expect(options.callbackURL).not.toContain(mobileOrigin);
    expect(options.errorCallbackURL).not.toContain(mobileOrigin);
  });

  it("API erişim jetonunu Neon oturumunun session alanından alır", async () => {
    const client = {
      getSession: async () => ({
        data: { session: { token: "signed-neon-jwt" } },
      }),
    };

    await expect(getNeonAccessToken(client)).resolves.toBe("signed-neon-jwt");
  });

  it("Neon kullanıcısını arayüz biçimine dönüştürür", () => {
    expect(mapNeonUser({
      id: "user-1",
      email: "uye@example.com",
      name: "VaultDrop Üyesi",
      image: "https://example.com/avatar.png",
    })).toEqual({
      id: "user-1",
      email: "uye@example.com",
      displayName: "VaultDrop Üyesi",
      avatarUrl: "https://example.com/avatar.png",
      plan: "free",
    });
  });
});
