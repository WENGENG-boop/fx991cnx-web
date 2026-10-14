/*
 * Minimal SDL_image compatibility header for the WebAssembly build.
 *
 * IMG_Load does not decode anything here: the PNG is decoded on the JavaScript
 * side and handed to the core through emu_web_set_interface_image(), which
 * stages the pixels before Emulator's constructor runs. IMG_Load then produces
 * a surface backed by that staged buffer.
 */
#pragma once

#include "SDL.h"

#define IMG_INIT_PNG 0x00000002u

int IMG_Init(int flags);
void IMG_Quit(void);
const char *IMG_GetError(void);
SDL_Surface *IMG_Load(const char *file);

namespace sdl_soft
{
	/* Staged pixels consumed by the next IMG_Load call. */
	void StageInterfaceImage(const Uint8 *rgba, int w, int h);
	bool HasStagedInterfaceImage();
	int StagedInterfaceWidth();
	int StagedInterfaceHeight();
	const Uint8 *StagedInterfacePixels();
}
