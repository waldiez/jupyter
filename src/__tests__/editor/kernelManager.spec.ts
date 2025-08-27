/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2025 Waldiez & contributors
 */
import { WaldiezKernelManager } from "../../editor/kernelManager";
import { WaldiezLogger } from "../../logger";
import { editorContext } from "../utils";
import { CommandRegistry } from "@lumino/commands";

// Mock dependencies
jest.mock("../../logger");
jest.mock("@waldiez/react", () => ({
    showSnackbar: jest.fn(),
}));

describe("WaldiezKernelManager", () => {
    let kernelManager: WaldiezKernelManager;
    let commands: CommandRegistry;
    let logger: jest.Mocked<WaldiezLogger>;
    let sessionContext: any;

    beforeEach(() => {
        commands = new CommandRegistry();
        logger = {
            log: jest.fn(),
        } as any;

        sessionContext = {
            ...editorContext.sessionContext,
            statusChanged: {
                connect: jest.fn(),
            },
            session: {
                kernel: {
                    restart: jest.fn().mockResolvedValue(void 0),
                    interrupt: jest.fn().mockResolvedValue(void 0),
                },
            },
        };

        kernelManager = new WaldiezKernelManager(commands, logger, "test-editor", sessionContext);
    });

    afterEach(() => {
        jest.clearAllMocks();
        kernelManager.dispose();
    });

    describe("constructor", () => {
        it("should create restart and interrupt buttons", () => {
            expect(kernelManager.restartButton).toBeDefined();
            expect(kernelManager.interruptButton).toBeDefined();
        });

        it("should register commands", () => {
            const restartCommandId = "waldiez:restart-kernel-test-editor";
            const interruptCommandId = "waldiez:interrupt-kernel-test-editor";

            expect(commands.hasCommand(restartCommandId)).toBe(true);
            expect(commands.hasCommand(interruptCommandId)).toBe(true);
        });

        it("should connect to session status changes", () => {
            expect(sessionContext.statusChanged.connect).toHaveBeenCalledWith(
                expect.any(Function),
                kernelManager,
            );
        });
    });

    describe("kernel property", () => {
        it("should return kernel from session", () => {
            const mockKernel = { status: "idle" };
            sessionContext.session = { kernel: mockKernel };

            expect(kernelManager.kernel).toBe(mockKernel);
        });

        it("should return null when no session", () => {
            sessionContext.session = null;

            expect(kernelManager.kernel).toBe(null);
        });

        it("should return null when no kernel", () => {
            sessionContext.session = { kernel: null };

            expect(kernelManager.kernel).toBe(null);
        });
    });

    describe("restart", () => {
        it("should restart kernel successfully", async () => {
            const mockRestart = jest.fn().mockResolvedValue(void 0);
            sessionContext.session = {
                kernel: {
                    restart: mockRestart,
                },
            };

            await kernelManager.restart();

            expect(mockRestart).toHaveBeenCalled();
            expect(logger.log).toHaveBeenCalledWith({
                data: "Kernel restarted",
                level: "info",
                type: "text",
            });
        });

        it("should handle restart error", async () => {
            const error = new Error("Restart failed");
            const mockRestart = jest.fn().mockRejectedValue(error);
            sessionContext.session = {
                kernel: {
                    restart: mockRestart,
                },
            };

            await kernelManager.restart();

            expect(mockRestart).toHaveBeenCalled();
            expect(logger.log).toHaveBeenCalledWith({
                data: "Error restarting kernel: Error: Restart failed",
                level: "error",
                type: "text",
            });
        });

        it("should do nothing when no session", async () => {
            sessionContext.session = null;

            await kernelManager.restart();

            expect(logger.log).not.toHaveBeenCalled();
        });

        it("should do nothing when no kernel", async () => {
            sessionContext.session = { kernel: null };

            await kernelManager.restart();

            expect(logger.log).not.toHaveBeenCalled();
        });
    });

    describe("interrupt", () => {
        it("should interrupt kernel successfully", async () => {
            const mockInterrupt = jest.fn().mockResolvedValue(void 0);
            sessionContext.session = {
                kernel: {
                    interrupt: mockInterrupt,
                },
            };

            await kernelManager.interrupt();

            expect(mockInterrupt).toHaveBeenCalled();
        });

        it("should handle interrupt error", async () => {
            const error = new Error("Interrupt failed");
            const mockInterrupt = jest.fn().mockRejectedValue(error);
            sessionContext.session = {
                kernel: {
                    interrupt: mockInterrupt,
                },
            };

            await kernelManager.interrupt();

            expect(mockInterrupt).toHaveBeenCalled();
        });

        it("should do nothing when no session", async () => {
            sessionContext.session = null;

            await kernelManager.interrupt();
            // No assertion needed - just ensuring no errors
        });
    });

    describe("session status changes", () => {
        it("should log status changes", () => {
            // Simulate a status change
            const logSpy = jest.spyOn(logger, "log");
            kernelManager["_onSessionStatusChanged"](sessionContext, "busy");

            expect(logSpy).toHaveBeenCalledWith({
                data: "Kernel status changed to busy",
                level: "debug",
                type: "text",
            });
        });
    });

    describe("dispose", () => {
        it("should dispose buttons and commands", () => {
            const restartButtonDispose = jest.spyOn(kernelManager.restartButton, "dispose");
            const interruptButtonDispose = jest.spyOn(kernelManager.interruptButton, "dispose");

            kernelManager.dispose();

            expect(restartButtonDispose).toHaveBeenCalled();
            expect(interruptButtonDispose).toHaveBeenCalled();
        });

        it("should notify command changes", () => {
            const notifyCommandChanged = jest.spyOn(commands, "notifyCommandChanged");

            kernelManager.dispose();

            expect(notifyCommandChanged).toHaveBeenCalledTimes(2);
        });
    });
});
