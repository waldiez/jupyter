# SPDX-License-Identifier: Apache-2.0.
# Copyright (c) 2024 - 2025 Waldiez and contributors.
"""Handle gathering state after interrupt."""

import json
from collections.abc import Awaitable

from jupyter_server.base.handlers import APIHandler
from tornado.web import authenticated
from waldiez import WaldiezRunner


class InterruptHandler(APIHandler):
    """Interrupt handler to gather any results after interrupt."""

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
        try:
            _, msg = WaldiezRunner.gather()
            self.log.debug(msg)
        except BaseException as err:  # pragma: no cover
            self.log.error(err)
        await self.finish(json.dumps({"status": "ok"}))
