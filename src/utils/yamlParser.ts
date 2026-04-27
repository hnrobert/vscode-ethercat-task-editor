import * as yaml from 'yaml';

type YamlParseOptions = yaml.ParseOptions &
  yaml.DocumentOptions &
  yaml.SchemaOptions &
  yaml.ToJSOptions;

const CustomTags: yaml.Tags = [
  ...[
    '!uint8_t',
    '!int8_t',
    '!uint16_t',
    '!int16_t',
    '!uint32_t',
    '!int32_t',
    '!float',
  ].map((tag) => ({
    tag,
    identify: (value: unknown) => typeof value === 'number',
    resolve: (str: string) => {
      const num = Number(str);
      const node = new yaml.Scalar(num);
      if (str.toLowerCase().startsWith('0x')) {
        node.format = 'HEX';
        (node as any)._originalSource = str;
        node.toJSON = function () {
          if (
            (this as any)._originalSource &&
            Number((this as any)._originalSource) === this.value
          ) {
            return (this as any)._originalSource;
          }
          return '0x' + this.value.toString(16);
        };
      }
      return node;
    },
    stringify: (item: yaml.Scalar) => {
      if (item.format === 'HEX' && typeof item.value === 'number') {
        if (
          (item as any)._originalSource &&
          Number((item as any)._originalSource) === item.value
        ) {
          return (item as any)._originalSource;
        }
        return '0x' + item.value.toString(16);
      }
      return String(item.value);
    },
  })),
  {
    tag: '!std::string',
    identify: (value: unknown) => typeof value === 'string',
    resolve: (str: string) => String(str),
  },
];

const yamlParseOptions: YamlParseOptions = { customTags: CustomTags };

export function parseYamlWithTags(text: string): unknown {
  return yaml.parse(text, yamlParseOptions);
}

export function parseYamlDocumentWithTags(text: string): yaml.Document {
  return yaml.parseDocument(text, yamlParseOptions);
}

export function stringifyYamlDocumentWithTags(doc: yaml.Document): string {
  let output = doc.toString({ indent: 2, indentSeq: true });

  // Remove blank lines right after "slaves:" before first slave
  output = output.replace(/(slaves:)\n+(\n  -)/g, '$1\n$2');

  // Remove any existing blank lines after "tasks:" before first task
  output = output.replace(/(\n {6}tasks:)\n+(\n {8}- app_\d+:)/g, '$1$2');

  // Ensure blank line before "tasks:" (after any field at same indentation level)
  output = output.replace(
    /(\n {6}[a-z_]+: !(?:uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|float|std::string) [^\n]+)(\n {6}tasks:)/g,
    '$1\n$2',
  );

  // Ensure blank lines between tasks
  output = output.replace(
    /(\n {12}[a-z_0-9]+: !(?:uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|float|std::string) [^\n]+)(\n {8}- app_\d+:)/g,
    '$1\n$2',
  );

  // Ensure blank lines between slaves
  output = output.replace(
    /(\n {12}[a-z_0-9]+: !(?:uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|float|std::string) [^\n]+)(\n {2}- sn\d+:)/g,
    '$1\n$2',
  );

  // Remove any stray blank lines inside slave/task blocks (not between them)
  output = output.replace(/\n\n+/g, (match, offset) => {
    // Keep exactly one blank line only if it's between slaves or between tasks
    // Otherwise collapse to single newline
    const after = output.substring(offset + match.length, offset + match.length + 10);
    if (after.match(/^ {2}- sn/) || after.match(/^ {8}- app_/)) {
      return '\n\n';
    }
    return '\n';
  });

  return output;
}

export function stringifyYamlWithTags(data: unknown): string {
  return yaml.stringify(data, { customTags: CustomTags });
}
