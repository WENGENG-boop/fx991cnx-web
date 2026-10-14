/*
 * C API exported to JavaScript.
 *
 * Everything the front-end needs goes through these functions; the emulator
 * core itself is untouched apart from the CASIOEMU_WEB guards described in
 * web/README.md.
 */
#include <SDL.h>
#include <SDL_image.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EMU_EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EMU_EXPORT extern "C"
#endif

#include "../../emulator/Emulator.hpp"
#include "../../emulator/Logger.hpp"
#include "../../emulator/Chipset/Chipset.hpp"
#include "../../emulator/Chipset/MMU.hpp"
#include "../../emulator/Data/HardwareId.hpp"
#include "../../emulator/Data/ModelInfo.hpp"
#include "../../emulator/Peripheral/BatteryBackedRAM.hpp"

namespace
{
	/* Anything longer than this is clamped: a background tab must not be able
	 * to freeze the page by asking for ten seconds of emulated time at once. */
	const double kMaxSliceMs = 100.0;

	std::map<std::string, std::string> g_argv;
	casioemu::Emulator *g_emulator = nullptr;
	double g_cycle_remainder = 0.0;

	int RamSize()
	{
		if (!g_emulator)
			return 0;

		size_t size;
		switch (g_emulator->hardware_id)
		{
		case casioemu::HW_ES_PLUS:
			size = 0xE00;
			break;
		case casioemu::HW_CLASSWIZ:
			size = 0x2000;
			break;
		case casioemu::HW_CLASSWIZ_II:
			size = 0x6000;
			break;
		default:
			return 0;
		}
		if (!((int)g_emulator->GetModelInfo("real_hardware")))
			size += 0x100;
		return (int)size;
	}

	SDL_Event MakeMouseEvent(int type, int button, int state, int x, int y)
	{
		SDL_Event event;
		SDL_zero(event);
		event.type = type;
		event.button.button = button;
		event.button.state = state;
		event.button.x = x;
		event.button.y = y;
		return event;
	}

	/* Pushes the model's button_map table so the front-end can draw hit
	 * regions and build its own keyboard mapping from the same names. */
	bool PushButtonMap(int *out_count)
	{
		if (!g_emulator)
			return false;

		lua_State *state = g_emulator->lua_state;
		lua_geti(state, LUA_REGISTRYINDEX, g_emulator->lua_model_ref);
		if (!lua_istable(state, -1))
		{
			lua_pop(state, 1);
			return false;
		}
		if (lua_getfield(state, -1, "button_map") != LUA_TTABLE)
		{
			lua_pop(state, 2);
			return false;
		}

		lua_len(state, -1);
		*out_count = (int)lua_tointeger(state, -1);
		lua_pop(state, 1);
		return true;
	}
}

/* --- lifecycle ----------------------------------------------------------- */

EMU_EXPORT int emu_web_init(const char *model_dir, const char *script_path)
{
	if (g_emulator)
		return 1;
	if (!model_dir || !*model_dir)
	{
		std::fprintf(stderr, "[emu_web] emu_web_init: model_dir is empty\n");
		return -1;
	}
	if (!sdl_soft::HasStagedInterfaceImage())
	{
		std::fprintf(stderr, "[emu_web] emu_web_init: no interface image staged; "
			"call emu_web_set_interface_image() first\n");
		return -1;
	}

	g_argv.clear();
	g_argv["model"] = model_dir;
	if (script_path && *script_path)
		g_argv["script"] = script_path;

	g_cycle_remainder = 0.0;
	g_emulator = new casioemu::Emulator(g_argv);

	std::fprintf(stderr, "[emu_web] ready: device %d x %d, %u cycles/s, %d bytes of RAM\n",
		sdl_soft::BackbufferWidth(), sdl_soft::BackbufferHeight(),
		g_emulator->GetCyclesPerSecond(), RamSize());
	return 0;
}

EMU_EXPORT int emu_web_ready(void)
{
	return g_emulator ? 1 : 0;
}

EMU_EXPORT void emu_web_destroy(void)
{
	delete g_emulator;
	g_emulator = nullptr;
	g_argv.clear();
	g_cycle_remainder = 0.0;
	sdl_soft::Shutdown();
}

/* --- device geometry ----------------------------------------------------- */

EMU_EXPORT int emu_web_device_width(void)
{
	return sdl_soft::BackbufferWidth();
}

EMU_EXPORT int emu_web_device_height(void)
{
	return sdl_soft::BackbufferHeight();
}

EMU_EXPORT void emu_web_set_interface_image(const unsigned char *rgba, int width, int height)
{
	if (!rgba || width <= 0 || height <= 0)
		return;
	sdl_soft::StageInterfaceImage(rgba, width, height);
	if (g_emulator || sdl_soft::BackbufferWidth() > 0)
		sdl_soft::UpdateInterfaceTexture(rgba, width, height);
}

/* --- running ------------------------------------------------------------- */

EMU_EXPORT int emu_web_run(double elapsed_ms)
{
	if (!g_emulator)
		return 0;

	if (elapsed_ms < 0)
		elapsed_ms = 0;
	if (elapsed_ms > kMaxSliceMs)
		elapsed_ms = kMaxSliceMs;

	if (!g_emulator->GetPaused() && elapsed_ms > 0)
	{
		double wanted = elapsed_ms * (double)g_emulator->GetCyclesPerSecond() / 1000.0 + g_cycle_remainder;
		uint64_t cycles = (uint64_t)wanted;
		g_cycle_remainder = wanted - (double)cycles;
		for (uint64_t ix = 0; ix != cycles; ++ix)
			g_emulator->Tick();
	}

	if (g_emulator->chipset.GetRequireFrame())
	{
		g_emulator->Frame();
		return 1;
	}
	return 0;
}

/*
 * The returned pointer refers to emulator-owned memory. Emscripten may move
 * the whole heap on growth, so re-read this pointer after every emu_web_run()
 * call instead of caching it.
 */
EMU_EXPORT const unsigned char *emu_web_fb(void)
{
	return sdl_soft::BackbufferRGBA();
}

EMU_EXPORT int emu_web_fb_size(void)
{
	return sdl_soft::BackbufferWidth() * sdl_soft::BackbufferHeight() * 4;
}

/* --- input --------------------------------------------------------------- */

EMU_EXPORT int emu_web_key(const char *sdl_key_name, int down)
{
	if (!g_emulator || !sdl_key_name)
		return 0;

	SDL_Keycode keycode = SDL_GetKeyFromName(sdl_key_name);
	if (keycode == 0)
		return 0;

	SDL_Event event;
	SDL_zero(event);
	event.type = down ? SDL_KEYDOWN : SDL_KEYUP;
	event.key.state = down ? SDL_PRESSED : SDL_RELEASED;
	event.key.keysym.sym = keycode;
	g_emulator->UIEvent(event);
	return 1;
}

EMU_EXPORT void emu_web_pointer(int phase, int x, int y)
{
	if (!g_emulator)
		return;

	switch (phase)
	{
	case 0:
	{
		SDL_Event event;
		SDL_zero(event);
		event.type = SDL_MOUSEMOTION;
		event.motion.x = x;
		event.motion.y = y;
		event.motion.xrel = x;
		event.motion.yrel = y;
		g_emulator->UIEvent(event);
		break;
	}
	case 1:
	{
		SDL_Event event = MakeMouseEvent(SDL_MOUSEBUTTONDOWN, SDL_BUTTON_LEFT, SDL_PRESSED, x, y);
		g_emulator->UIEvent(event);
		break;
	}
	case 2:
	{
		SDL_Event event = MakeMouseEvent(SDL_MOUSEBUTTONUP, SDL_BUTTON_LEFT, SDL_RELEASED, x, y);
		g_emulator->UIEvent(event);
		break;
	}
	case 3:
	{
		SDL_Event event = MakeMouseEvent(SDL_MOUSEBUTTONDOWN, SDL_BUTTON_RIGHT, SDL_PRESSED, x, y);
		g_emulator->UIEvent(event);
		break;
	}
	case 4:
	{
		SDL_Event event = MakeMouseEvent(SDL_MOUSEBUTTONUP, SDL_BUTTON_RIGHT, SDL_RELEASED, x, y);
		g_emulator->UIEvent(event);
		break;
	}
	default:
		break;
	}
}

/* --- control ------------------------------------------------------------- */

EMU_EXPORT void emu_web_set_paused(int paused)
{
	if (g_emulator)
		g_emulator->SetPaused(paused != 0);
}

EMU_EXPORT int emu_web_is_paused(void)
{
	return g_emulator && g_emulator->GetPaused() ? 1 : 0;
}

EMU_EXPORT void emu_web_reset(void)
{
	if (!g_emulator)
		return;
	g_cycle_remainder = 0.0;
	g_emulator->chipset.Reset();
}

EMU_EXPORT void emu_web_command(const char *lua_code)
{
	if (!g_emulator || !lua_code)
		return;
	g_emulator->ExecuteCommand(lua_code);
}

/* --- persistence --------------------------------------------------------- */

EMU_EXPORT int emu_web_save_size(void)
{
	int size = RamSize();
	if (!casioemu::BatteryBackedRAM::rom_addr)
		return 0;
	return size;
}

EMU_EXPORT int emu_web_save(unsigned char *out, int capacity)
{
	int size = emu_web_save_size();
	if (!out || size <= 0 || capacity < size)
		return -1;
	std::memcpy(out, casioemu::BatteryBackedRAM::rom_addr, (size_t)size);
	return size;
}

EMU_EXPORT int emu_web_load(const unsigned char *in, int length)
{
	if (!in || length <= 0)
		return -1;

	int size = emu_web_save_size();
	if (size <= 0)
		return -1;

	if (length < size)
		size = length;
	std::memcpy(casioemu::BatteryBackedRAM::rom_addr, in, (size_t)size);
	return size;
}

/* --- debugging ----------------------------------------------------------- */

EMU_EXPORT int emu_web_read_mem(unsigned address, unsigned char *out, int length)
{
	if (!g_emulator || !out || length <= 0)
		return -1;

	for (int ix = 0; ix != length; ++ix)
		out[ix] = g_emulator->chipset.mmu.ReadData((address + ix) & 0xFFFFFF);
	return length;
}

EMU_EXPORT int emu_web_write_mem(unsigned address, const unsigned char *in, int length)
{
	if (!g_emulator || !in || length <= 0)
		return -1;

	for (int ix = 0; ix != length; ++ix)
		g_emulator->chipset.mmu.WriteData((address + ix) & 0xFFFFFF, in[ix]);
	return length;
}

/* --- files --------------------------------------------------------------- */

EMU_EXPORT int emu_web_write_file(const char *path, const unsigned char *data, int length)
{
	if (!path || !*path || length < 0)
		return -1;
	if (length > 0 && !data)
		return -1;

	FILE *handle = std::fopen(path, "wb");
	if (!handle)
		return -1;

	size_t written = length > 0 ? std::fwrite(data, 1, (size_t)length, handle) : 0;
	std::fclose(handle);
	return (int)written == length ? 0 : -1;
}

/* --- model introspection ------------------------------------------------- */

EMU_EXPORT int emu_web_hardware_id(void)
{
	return g_emulator ? (int)g_emulator->hardware_id : -1;
}

EMU_EXPORT int emu_web_model_name(char *buffer, int capacity)
{
	if (!g_emulator || !buffer || capacity <= 0)
		return -1;

	std::string name = g_emulator->GetModelInfo("model_name");
	int length = (int)name.size();
	int copied = length < capacity - 1 ? length : capacity - 1;
	std::memcpy(buffer, name.data(), (size_t)copied);
	buffer[copied] = '\0';
	return length;
}

EMU_EXPORT int emu_web_button_count(void)
{
	int count = 0;
	if (!PushButtonMap(&count))
		return 0;
	lua_pop(g_emulator->lua_state, 2);
	return count;
}

/* Writes {x, y, w, h} into rect_out and returns 1 on success. */
EMU_EXPORT int emu_web_button_rect(int index, int *rect_out)
{
	int count = 0;
	if (!PushButtonMap(&count) || index < 0 || index >= count)
	{
		if (g_emulator && count > 0)
			lua_pop(g_emulator->lua_state, 2);
		return 0;
	}

	lua_State *state = g_emulator->lua_state;
	if (lua_geti(state, -1, index + 1) != LUA_TTABLE)
	{
		lua_pop(state, 3);
		return 0;
	}

	for (int ix = 0; ix != 4; ++ix)
	{
		if (lua_geti(state, -1 - ix, ix + 1) != LUA_TNUMBER)
		{
			lua_pop(state, 4 + 3);
			return 0;
		}
	}
	rect_out[0] = (int)lua_tointeger(state, -4);
	rect_out[1] = (int)lua_tointeger(state, -3);
	rect_out[2] = (int)lua_tointeger(state, -2);
	rect_out[3] = (int)lua_tointeger(state, -1);

	lua_pop(state, 4); /* the four numbers */
	lua_pop(state, 1); /* the button table */
	lua_pop(state, 2); /* button_map and the model table */
	return 1;
}

/* Writes the SDL key name bound to a button ("" when the button is unmapped)
 * and returns its length. */
EMU_EXPORT int emu_web_button_name(int index, char *buffer, int capacity)
{
	int count = 0;
	if (!PushButtonMap(&count) || index < 0 || index >= count)
	{
		if (g_emulator && count > 0)
			lua_pop(g_emulator->lua_state, 2);
		return -1;
	}

	lua_State *state = g_emulator->lua_state;
	if (lua_geti(state, -1, index + 1) != LUA_TTABLE)
	{
		lua_pop(state, 3);
		return -1;
	}
	if (lua_geti(state, -1, 6) != LUA_TSTRING)
	{
		lua_pop(state, 4);
		return -1;
	}

	size_t length = 0;
	const char *name = lua_tolstring(state, -1, &length);
	int copied = 0;
	if (buffer && capacity > 0)
	{
		copied = (int)length < capacity - 1 ? (int)length : capacity - 1;
		std::memcpy(buffer, name, (size_t)copied);
		buffer[copied] = '\0';
	}

	lua_pop(state, 1);
	lua_pop(state, 1);
	lua_pop(state, 2);
	return (int)length;
}
