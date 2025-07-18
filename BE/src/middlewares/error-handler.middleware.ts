import { Request, Response, NextFunction } from 'express';
import { IErrorResponse } from '@/types';
import { ERROR_MESSAGES, HTTP_STATUS_CODE, 
    AppError, DatabaseError, 
    NotFoundError, ValidationError,
    handleZodError,
    NODE_ENV
 } from '@/utils';
 import { ZodError } from 'zod';
import { config } from '@/config';
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
    let response: IErrorResponse = {
        statusCode: HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR,
        message: err.message || ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    };


    if(req.session) {
        req.session.abortTransaction();
        req.session.endSession();
    }

    if (err instanceof ZodError) {
        response = handleZodError(err);
    } else if (err instanceof DatabaseError) {
        response = {
            statusCode: HTTP_STATUS_CODE.BAD_REQUEST,
            message: err.message,
        };
    } else if (err instanceof ValidationError) {
        response = {
            statusCode: HTTP_STATUS_CODE.BAD_REQUEST,
            message: Object.values(err.errors)[0],
        };
    } else if (err instanceof NotFoundError) {
        response = {
            statusCode: HTTP_STATUS_CODE.NOT_FOUND,
            message: err.message,
        };
    } else if (err instanceof AppError) {
        response = {
            statusCode: err.statusCode,
            message: err.message,
        };
    }

    if(config.nodeEnv === NODE_ENV.DEVELOPMENT) {
        console.error(err);
    }

    res.status(response.statusCode).json({
        message: response.message,
    });
}
