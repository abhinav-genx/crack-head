import { Box, Text } from "ink";

const ROBOT = String.raw`
          *
         (o)
          |
    .-----------.
    | [o]   [o] |
    |    ___    |
    |   |. .|   |
    '-----+-----'
       .--+--.
    .--'     '--.
    | [ # # # ] |
    '--.     .--'
       |_| |_|
`
  .replace(/^\n/, "")
  .replace(/\n$/, "");

export const Banner = () => (
  <Box flexDirection="column" alignItems="center">
    <Text color="cyanBright">{ROBOT}</Text>

    {/* Ink draws this frame for us, so the box never mis-aligns. */}
    <Box borderStyle="double" borderColor="magenta" paddingX={3} marginTop={1}>
      <Text bold color="magentaBright">C R A C K</Text>
      <Text bold color="gray"> :: </Text>
      <Text bold color="magentaBright">H E A D</Text>
    </Box>

    <Text dimColor>{"< AI coding agent with a cracked head >   v1.0.0"}</Text>
    <Text color="gray">{"-------------- <> --------------"}</Text>
    <Text color="yellow">{"Enter > send    Esc > cancel    Ctrl+C > quit"}</Text>
  </Box>
);