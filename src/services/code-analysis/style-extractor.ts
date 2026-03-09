export interface CodeTokens {
  colors: CodeColorToken[];
  spacing: CodeSpacingToken[];
  typography: CodeTypographyToken[];
  components: CodeComponentToken[];
}

export interface CodeColorToken {
  value: string;
  property: string;
  file: string;
  line: string;
}

export interface CodeSpacingToken {
  property: string;
  value: string;
  file: string;
  line: string;
}

export interface CodeTypographyToken {
  property: string;
  value: string;
  file: string;
  line: string;
}

export interface CodeComponentToken {
  name: string;
  file: string;
}

// Regex patterns for extracting design tokens from code
const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RGB_COLOR = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g;
const THEME_TOKEN = /tokens\.\w+|theme\.\w+(?:\.\w+)*/g;

const SPACING_PROPS = /(?:padding|margin|gap|top|bottom|left|right|inset)[\s:]+["']?([\d.]+(?:px|rem|em))/gi;

const FONT_SIZE = /fontSize[\s:]+["']?([\d.]+(?:px|rem|em))/gi;
const FONT_WEIGHT = /fontWeight[\s:]+["']?(\d{3}|bold|normal|semibold|medium|light)/gi;
const FONT_FAMILY = /fontFamily[\s:]+["']([^"']+)["']/gi;

// Fluent UI component imports
const FLUENT_IMPORT = /import\s+\{([^}]+)\}\s+from\s+['"]@fluentui\/react[^'"]*['"]/g;

/**
 * Extract design token usage from code additions.
 */
export function extractCodeTokens(
  additions: string[],
  filePath: string
): CodeTokens {
  const colors: CodeColorToken[] = [];
  const spacing: CodeSpacingToken[] = [];
  const typography: CodeTypographyToken[] = [];
  const components: CodeComponentToken[] = [];

  for (const line of additions) {
    // Extract hex colors
    let match: RegExpExecArray | null;

    HEX_COLOR.lastIndex = 0;
    while ((match = HEX_COLOR.exec(line)) !== null) {
      colors.push({ value: match[0].toLowerCase(), property: 'color', file: filePath, line });
    }

    // Extract rgb/rgba colors
    RGB_COLOR.lastIndex = 0;
    while ((match = RGB_COLOR.exec(line)) !== null) {
      colors.push({ value: match[0], property: 'color', file: filePath, line });
    }

    // Extract theme token references
    THEME_TOKEN.lastIndex = 0;
    while ((match = THEME_TOKEN.exec(line)) !== null) {
      colors.push({ value: match[0], property: 'token', file: filePath, line });
    }

    // Extract spacing values
    SPACING_PROPS.lastIndex = 0;
    while ((match = SPACING_PROPS.exec(line)) !== null) {
      spacing.push({ property: match[0].split(/[\s:]/)[0], value: match[1], file: filePath, line });
    }

    // Extract font sizes
    FONT_SIZE.lastIndex = 0;
    while ((match = FONT_SIZE.exec(line)) !== null) {
      typography.push({ property: 'fontSize', value: match[1], file: filePath, line });
    }

    // Extract font weights
    FONT_WEIGHT.lastIndex = 0;
    while ((match = FONT_WEIGHT.exec(line)) !== null) {
      typography.push({ property: 'fontWeight', value: match[1], file: filePath, line });
    }

    // Extract font families
    FONT_FAMILY.lastIndex = 0;
    while ((match = FONT_FAMILY.exec(line)) !== null) {
      typography.push({ property: 'fontFamily', value: match[1], file: filePath, line });
    }

    // Extract Fluent UI component imports
    FLUENT_IMPORT.lastIndex = 0;
    while ((match = FLUENT_IMPORT.exec(line)) !== null) {
      const imports = match[1].split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of imports) {
        components.push({ name, file: filePath });
      }
    }
  }

  return { colors, spacing, typography, components };
}

/**
 * Merge tokens from multiple files.
 */
export function mergeCodeTokens(tokenSets: CodeTokens[]): CodeTokens {
  return {
    colors: tokenSets.flatMap((t) => t.colors),
    spacing: tokenSets.flatMap((t) => t.spacing),
    typography: tokenSets.flatMap((t) => t.typography),
    components: tokenSets.flatMap((t) => t.components),
  };
}
