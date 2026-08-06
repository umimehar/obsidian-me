import { Callout, Code, Text } from "@radix-ui/themes";

export interface DataErrorProps {
  /** The thrown message, shown verbatim. A reader debugging their own data needs the real one. */
  message: string;
}

/**
 * What the dashboard shows instead of figures when its committed artifacts
 * cannot be read. It states the failure and the command that fixes it: a
 * blank page or a spinner that never resolves would leave a reader guessing
 * whether the portfolio is empty or the build never ran.
 */
export function DataError({ message }: DataErrorProps) {
  return (
    <Callout.Root color="red" role="alert">
      {/* Three sibling Callout.Text blocks, not one wrapping a Flex: Callout.Text
          renders a <p>, and a <div> nested inside it is invalid HTML. */}
      <Callout.Text>
        <Text weight="bold">The dashboard could not read its data.</Text>
      </Callout.Text>
      <Callout.Text>{message}</Callout.Text>
      <Callout.Text>
        Rebuild the artifacts with <Code>bun run build</Code> and then{" "}
        <Code>bun run analytics</Code>, from the app directory.
      </Callout.Text>
    </Callout.Root>
  );
}
