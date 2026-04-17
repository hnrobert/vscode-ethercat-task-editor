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
  return doc.toString({ indent: 2, indentSeq: true });
}

export function stringifyYamlWithTags(data: unknown): string {
  return yaml.stringify(data, { customTags: CustomTags });
}
