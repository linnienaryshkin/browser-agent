import { useState } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Toolbar from '@mui/material/Toolbar';
import AppBar from '@mui/material/AppBar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import MenuIcon from '@mui/icons-material/Menu';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import CheckIcon from '@mui/icons-material/Check';
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
import { Chat as ChatCanvas } from './labs/Canvas';
import type { ModelId } from './types';

const TABS = [
  { label: 'Canvas', path: '/' },
  { label: 'Hello', path: '/hello' },
  { label: 'Memory', path: '/memory' },
  { label: 'Tool', path: '/tool' },
  { label: 'Input', path: '/input' },
  { label: 'Loop', path: '/loop' },
  { label: 'Streaming', path: '/streaming' },
  { label: 'MCP', path: '/mcp-lab' },
  { label: 'Meteo', path: '/meteo' },
];

const MODELS: { id: ModelId; label: string }[] = [
  { id: 'claude-haiku-4-5', label: 'Haiku' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
  { id: 'claude-opus-4-7', label: 'Opus' },
];

interface LayoutProps {
  mode: 'light' | 'dark';
  onSetTheme: (mode: 'light' | 'dark') => void;
  model: ModelId;
  onSetModel: (model: ModelId) => void;
}

function Layout({ mode, onSetTheme, model, onSetModel }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tab = TABS.findIndex((t) => t.path === location.pathname);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

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
          <IconButton
            color="inherit"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label="open menu"
          >
            <MenuIcon />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem
              onClick={() => {
                onSetTheme(mode === 'dark' ? 'light' : 'dark');
                setMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                {mode === 'dark' ? (
                  <Brightness7Icon fontSize="small" />
                ) : (
                  <Brightness4Icon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>{mode === 'dark' ? 'Light mode' : 'Dark mode'}</ListItemText>
            </MenuItem>
            <Divider />
            {MODELS.map((m) => (
              <MenuItem
                key={m.id}
                onClick={() => {
                  onSetModel(m.id);
                  setMenuAnchor(null);
                }}
              >
                <ListItemIcon>{model === m.id && <CheckIcon fontSize="small" />}</ListItemIcon>
                <ListItemText>{m.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
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
  onSetTheme: (mode: 'light' | 'dark') => void;
  model: ModelId;
  onSetModel: (model: ModelId) => void;
}

export default function App({ mode, onSetTheme, model, onSetModel }: AppProps) {
  return (
    <BrowserRouter>
      <Layout mode={mode} onSetTheme={onSetTheme} model={model} onSetModel={onSetModel} />
    </BrowserRouter>
  );
}
