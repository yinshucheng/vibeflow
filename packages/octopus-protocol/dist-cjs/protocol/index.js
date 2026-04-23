"use strict";
/**
 * Octopus Protocol SDK — Shared protocol logic for all clients.
 *
 * Re-exports all SDK modules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHeartbeat = exports.createEventBuilder = exports.createActionRPC = exports.createStateManager = exports.createCommandHandler = void 0;
var command_handler_1 = require("./command-handler");
Object.defineProperty(exports, "createCommandHandler", { enumerable: true, get: function () { return command_handler_1.createCommandHandler; } });
var state_manager_1 = require("./state-manager");
Object.defineProperty(exports, "createStateManager", { enumerable: true, get: function () { return state_manager_1.createStateManager; } });
var action_rpc_1 = require("./action-rpc");
Object.defineProperty(exports, "createActionRPC", { enumerable: true, get: function () { return action_rpc_1.createActionRPC; } });
var event_builder_1 = require("./event-builder");
Object.defineProperty(exports, "createEventBuilder", { enumerable: true, get: function () { return event_builder_1.createEventBuilder; } });
var heartbeat_1 = require("./heartbeat");
Object.defineProperty(exports, "createHeartbeat", { enumerable: true, get: function () { return heartbeat_1.createHeartbeat; } });
//# sourceMappingURL=index.js.map