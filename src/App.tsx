import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Chat as ChatHello } from './challenges/challenge.hello';
import { Chat as ChatMemory } from './challenges/challenge.memory';
import { Chat as ChatTool } from './challenges/challenge.tool';
import { Chat as ChatInput } from './challenges/challenge.input';
import { Chat as ChatLoop } from './challenges/challenge.loop';
import { Chat as ChatMcp } from './challenges/challenge.mcp';
import { Chat as ChatSolution } from './challenges/Solution';
import { Chat as ChatCanvas } from './challenges/Exercise';

const TABS = [
  { label: 'Canvas', path: '/' },
  { label: 'Hello', path: '/hello' },
  { label: 'Memory', path: '/memory' },
  { label: 'Tool', path: '/tool' },
  { label: 'Input', path: '/input' },
  { label: 'Loop', path: '/loop' },
  { label: 'MCP', path: '/mcp-challenge' },
  { label: 'Solution', path: '/solution' },
];

interface LayoutProps {
  mode: 'light' | 'dark';
  onToggleTheme: () => void;
}

function Layout({ mode, onToggleTheme }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tab = TABS.findIndex((t) => t.path === location.pathname);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="fixed">
        <Toolbar>
          <Typography variant="h6" noWrap sx={{ mr: 4 }}>
            BrowserAgent
          </Typography>
          <Tabs
            value={tab === -1 ? 0 : tab}
            onChange={(_, v) => navigate(TABS[v].path)}
            textColor="inherit"
            indicatorColor="secondary"
            variant="scrollable"
            scrollButtons="auto"
          >
            {TABS.map((t) => (
              <Tab key={t.path} label={t.label} />
            ))}
          </Tabs>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton color="inherit" onClick={onToggleTheme} aria-label="toggle theme">
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Toolbar />
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<ChatCanvas />} />
          <Route path="/hello" element={<ChatHello />} />
          <Route path="/memory" element={<ChatMemory />} />
          <Route path="/tool" element={<ChatTool />} />
          <Route path="/input" element={<ChatInput />} />
          <Route path="/loop" element={<ChatLoop />} />
          <Route path="/mcp-challenge" element={<ChatMcp />} />
          <Route path="/solution" element={<ChatSolution />} />
        </Routes>
      </Box>
    </Box>
  );
}

interface AppProps {
  mode: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function App({ mode, onToggleTheme }: AppProps) {
  return (
    <BrowserRouter>
      <Layout mode={mode} onToggleTheme={onToggleTheme} />
    </BrowserRouter>
  );
}
