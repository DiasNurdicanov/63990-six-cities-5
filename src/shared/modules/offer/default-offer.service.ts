import { inject, injectable } from 'inversify';
import { OfferService } from './offer-service.interface.js';
import { Component } from '../../types/index.js';
import { Logger } from '../../libs/logger/index.js';
import { DocumentType, types } from '@typegoose/typegoose';
import { OfferEntity } from './offer.entity.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';
import { UpdateOfferDto } from './dto/update-offer.dto.js';
import { DEFAULT_OFFER_COUNT } from './offer.constant.js';
import { SortType } from '../../types/sort-type.enum.js';

@injectable()
export class DefaultOfferService implements OfferService {
  constructor(
    @inject(Component.Logger) private readonly logger: Logger,
    @inject(Component.OfferModel) private readonly offerModel: types.ModelType<OfferEntity>
  ) {}

  public async create(dto: CreateOfferDto): Promise<DocumentType<OfferEntity>> {
    const result = await this.offerModel.create(dto);
    this.logger.info(`New offer created: ${dto.name}`);

    return result;
  }

  public async findById(offerId: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findById(offerId)
      .populate(['author'])
      .exec();
  }

  public async findByName(name: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findOne({ name })
      .exec();
  }

  public async find(limit = DEFAULT_OFFER_COUNT): Promise<DocumentType<OfferEntity>[]> {
    return this.offerModel
      .aggregate([
        {
          $lookup: {
            from: 'comments',
            let: { offerId: '$_id'},
            pipeline: [
              { $match: { $expr: { $eq: [ '$offerId', '$$offerId' ] } } },
              { $project: { _id: 1, rating: 1}}
            ],
            as: 'offerComments'
          },
        },
        {
          $lookup: {
            from: 'offers-favorites',
            let: { offerId: '$_id', userId: '$author' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: [ '$offerId', '$$offerId' ] },
                      { $eq: [ '$userId', '$$userId' ] }
                    ]
                  }
                }
              },
              { $project: { _id: 1 }}
            ],
            as: 'favorites'
          },
        },
        { $addFields:
          {
            rating: { $round: [ { $avg: '$offerComments.rating'}, 1 ] },
            isFavorite: { $toBool: { $size: '$favorites' } }
          }
        },
        { $unset: ['offerComments', 'favorites'] },
        { $limit: limit },
        { $sort: { offerCount: SortType.Down } }
      ])
      .exec();
  }

  public async deleteById(offerId: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndDelete(offerId)
      .exec();
  }

  public async updateById(offerId: string, dto: UpdateOfferDto): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndUpdate(offerId, dto, {new: true})
      .exec();
  }

  public async exists(documentId: string): Promise<boolean> {
    return (await this.offerModel
      .exists({_id: documentId})) !== null;
  }

  public async incCommentCount(offerId: string): Promise<DocumentType<OfferEntity> | null> {
    return this.offerModel
      .findByIdAndUpdate(offerId, {'$inc': {
        commentsCount: 1,
      }}).exec();
  }

  public async findPremium(count: number, city: string): Promise<DocumentType<OfferEntity>[]> {
    return this.offerModel
      .find({ isPremium: true, city })
      .sort({ createdAt: SortType.Down })
      .limit(count)
      .exec();
  }

  public async findFavorites(): Promise<DocumentType<OfferEntity>[]> {
    return this.offerModel
      .find({ isFavorite: true})
      .exec();
  }
}
