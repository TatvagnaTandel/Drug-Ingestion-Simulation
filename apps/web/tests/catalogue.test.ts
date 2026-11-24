import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCatalogueDrug, searchCatalogue } from "../lib/catalogue";

const { client } = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("../lib/browser-data-client", () => ({ getBrowserDataClient: client }));

afterEach(() => {
  client.mockReset();
  vi.useRealTimers();
});

describe("offline catalogue", () => {
  it("searches and resolves source-backed bundled rows when unavailable", async () => {
    client.mockReturnValue(null);
    expect(await searchCatalogue("ibu")).toMatchObject({
      hits: [{ id: "ibuprofen", pkStatus: "reviewed", doseRange: [292, 300] }],
      offline: true,
    });
    const resolved = await resolveCatalogueDrug("ibuprofen");
    expect(resolved).toMatchObject({
      drug: { name: "Ibuprofen", sources: expect.arrayContaining(["https://pmc.ncbi.nlm.nih.gov/articles/PMC9232434/"]) },
      offline: true,
    });
  });

  it("falls back at eight seconds and lets the next search reach the live catalogue", async () => {
    vi.useFakeTimers();
    const searchDrugs = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ data: [], error: null });
    client.mockReturnValue({ drugs: { searchDrugs } });
    const pending = searchCatalogue("ibu");
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ offline: true, hits: [{ id: "ibuprofen" }] });
    expect(await searchCatalogue("ibu")).toMatchObject({ offline: false, hits: [] });
  });
});
