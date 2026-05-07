import { initializeDiagram, deinitializeDiagram } from "../src/features/diagram-init.js";
import { state, resetConfig } from "../src/core/config.js";
import { cloneSVGForModal } from "../src/core/svg-clone.js";

describe("Robust ID and Attribute Restoration", () => {
  let container;

  beforeEach(() => {
    resetConfig();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test("initializeDiagram does NOT mutate original SVG, but cloning does", () => {
    container.innerHTML = `
      <div id="target">
        <svg id="mysvg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad1">
              <stop offset="0%" stop-color="red" />
            </linearGradient>
          </defs>
          <rect id="myrect" fill="url(#grad1)" />
          <style id="mystyle">
            #myrect { stroke: red; }
            .some-url { fill: url(#grad1); }
          </style>
        </svg>
      </div>
    `;

    const target = document.getElementById("target");
    const svg = document.getElementById("mysvg");
    const rect = document.getElementById("myrect");
    const style = document.getElementById("mystyle");

    // 1. Initialize - Should NOT mutate
    initializeDiagram(target);

    // Verify IDs are NOT changed on the host page (MAJ-1)
    expect(svg.id).toBe("mysvg");
    expect(rect.id).toBe("myrect");
    expect(rect.getAttribute("fill")).toBe("url(#grad1)");
    expect(style.textContent).toContain("#myrect");

    // 2. Clone for Modal - Should isolate IDs
    const clone = cloneSVGForModal(svg);
    const clonedRect = clone.querySelector("rect");
    const clonedStyle = clone.querySelector("style");

    expect(clone.id).not.toBe("mysvg");
    expect(clonedRect.id).not.toBe("myrect");
    expect(clonedRect.getAttribute("fill")).not.toBe("url(#grad1)");
    expect(clonedStyle.textContent).not.toContain("#myrect");

    // Deinitialize
    deinitializeDiagram(target);

    // Verify host page remains clean
    expect(svg.id).toBe("mysvg");
  });
});
