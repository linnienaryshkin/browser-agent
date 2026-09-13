import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import GitHubIcon from '@mui/icons-material/GitHub';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Chat as ChatHello } from './labs/Hello.lab';
import { Chat as ChatMemory } from './labs/Memory.lab';
import { Chat as ChatTool } from './labs/Tool.lab';
import { Chat as ChatInput } from './labs/Input.lab';
import { Chat as ChatLoop } from './labs/Loop.lab';
import { Chat as ChatMcp } from './labs/Mcp.lab';
import { Chat as ChatMeteo } from './labs/Meteo.lab';
import { Chat as ChatStreaming } from './labs/Streaming.lab';
import { Chat as ChatExercise } from './labs/Exercise';

const TABS = [
  { label: 'Exercise', path: '/' },
  { label: 'Hello', path: '/hello' },
  { label: 'Memory', path: '/memory' },
  { label: 'Tool', path: '/tool' },
  { label: 'Input', path: '/input' },
  { label: 'Loop', path: '/loop' },
  { label: 'Streaming', path: '/streaming' },
  { label: 'MCP', path: '/mcp-lab' },
  { label: 'Meteo', path: '/meteo' },
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" noWrap>
              BrowserAgent
            </Typography>
            <IconButton
              size="small"
              color="inherit"
              href="https://github.com/linnienaryshkin/browser-agent"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="github"
              sx={{ p: 0.5 }}
            >
              <GitHubIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ ml: 4, flexGrow: 0 }} />
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
          <Route path="/" element={<ChatExercise />} />
          <Route path="/hello" element={<ChatHello />} />
          <Route path="/memory" element={<ChatMemory />} />
          <Route path="/tool" element={<ChatTool />} />
          <Route path="/input" element={<ChatInput />} />
          <Route path="/loop" element={<ChatLoop />} />
          <Route path="/streaming" element={<ChatStreaming />} />
          <Route path="/mcp-lab" element={<ChatMcp />} />
          <Route path="/meteo" element={<ChatMeteo />} />
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
