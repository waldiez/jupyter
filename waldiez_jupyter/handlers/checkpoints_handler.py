# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.
"""Handle gathering state after interrupt."""

import json
from collections.abc import Awaitable
from typing import Any

from jupyter_server.base.handlers import APIHandler
from tornado import httputil
from tornado.web import Application, HTTPError, authenticated
from waldiez.storage import StorageManager


class CheckpointsHandler(APIHandler):
    """Checkpoints handler to handle workflow checkpoints."""

    _manager: StorageManager
    _manager_initiated: bool = False

    def __init__(
        self,
        application: "Application",
        request: httputil.HTTPServerRequest,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            application=application,
            request=request,
            **kwargs,
        )
        if not self._manager_initiated:
            self._manager_initiated = True
            self._manager = StorageManager()

    @authenticated
    def data_received(self, chunk: bytes) -> Awaitable[None] | None:
        """Just to make the linter happy.

        avoid: Pylint W0223:abstract-method

        Parameters
        ----------
        chunk : bytes
            The chunk of data received.

        Returns
        -------
        Awaitable[None] | None
            The data handling coroutine.
        """
        return super().data_received(chunk)  # pragma: no cover

    @authenticated
    async def get(self) -> None:
        """Handle a GET request.

        Raises
        ------
        HTTPError
            If the request data is invalid.
        """
        # pylint: disable=broad-exception-caught
        flow_arg = self.get_query_argument("flow", None)
        if not flow_arg:
            raise HTTPError(400, reason="No flow argument in request")
        try:
            checkpoints = self._manager.history(flow_arg)
        except BaseException as err:  # pragma: no cover
            self.log.error(err)
            raise HTTPError(400, reason="Invalid request") from err
        await self.finish(json.dumps(checkpoints))

    @authenticated
    async def post(self) -> None:
        """Handle a POST request.

        Raises
        ------
        HTTPError
            If the request data is invalid.
        """
        input_data = self.get_json_body()
        if not input_data:
            raise HTTPError(400, reason="No data in request")
        self.log.debug(input_data)
        raise HTTPError(500, reason="Not yet implemented")
