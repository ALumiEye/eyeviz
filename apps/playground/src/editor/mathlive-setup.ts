/**
 * Loaded on demand: MathLive and its fonts (bundled by Vite through the CSS import, so no
 * fonts directory has to be served). Imported only through `import()` in MathInput.
 */
import "mathlive/fonts.css";
import { MathfieldElement } from "mathlive";

// Fonts come from the CSS above; keypress sounds are off.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export { MathfieldElement };
